"use client";

import React, { useState, useEffect } from 'react';
import { Card, Badge, Button, notify, confirmDialog, TablePagination } from '@/components/ui';
import { ModulePage } from '@/components/module-page';
import { 
  ShieldCheck, 
  Users, 
  History, 
  Search,
  Download,
  AlertTriangle,
  Info,
  ShieldAlert,
  Calendar,
  Filter,
  Eye,
  ChevronLeft,
  ChevronRight,
  Plus,
  Copy,
  Trash2,
  Edit2,
  Lock,
  Smartphone,
  Shield,
  CheckCircle2,
  XCircle,
  Save,
  UserCog,
  RefreshCw,
  Ban,
  KeyRound,
  UserX,
  UserCheck,
  Mail,
} from 'lucide-react';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
// DB Access
import { getProfiles, assignUserRole, saveProfile } from '@/shared/catalogs/catalogs';
import { getAdvancedAuditLogs, logAdvancedAudit } from '@/modules/platform/client/audit';
import { getRoles, getRolePermissions, updateRolePermission, getUsersWithRoles, getUserSecurity, updateUserSecurity, changeUserRole } from '@/modules/platform/client/roles';
import {
  adminUpdateUserPassword,
  adminToggleUserStatus,
  adminDeleteUser,
  adminCreateUser,
  adminInviteUser,
  adminSendPasswordResetEmail,
} from '@/lib/actions/users';
import { isValidAuthEmail } from '@/lib/auth/isValidAuthEmail';
import {
  listUserInvitations,
  revokeUserInvitation,
  deleteUserInvitation,
  type UserInvitationRow,
} from '@/lib/actions/userInvitations';
import { uploadAvatar } from '@/modules/platform/client/storage';
import { PERMISSION_MATRIX_MODULES } from '@/lib/permission-matrix';
import { useCan } from '@/components/authz';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Camera, Image as ImageIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatAuditDiffEntries } from '@/shared/audit/formatAuditDiff';

export default function SeguridadPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'audit' | 'invitations'>('roles');
  const [invitations, setInvitations] = useState<UserInvitationRow[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [invitationSearch, setInvitationSearch] = useState('');
  
  // ==========================================
  // AUDIT LOGS STATE
  // ==========================================
  const [logs, setLogs] = useState<any[]>([]);
  const [totalLogs, setTotalLogs] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [searchTerm, setSearchTerm] = useState('');
  // C5: la búsqueda de auditoría se resuelve server-side (.ilike) con debounce.
  const debouncedSearch = useDebouncedValue(searchTerm, 350);
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [selectedLog, setSelectedLog] = useState<any>(null);

  // ==========================================
  // RBAC & USERS STATE
  // ==========================================
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [hrEmployees, setHrEmployees] = useState<any[]>([]);
  const [roleSearch, setRoleSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const USERS_PAGE_SIZE = 25;
  const [savingPerm, setSavingPerm] = useState<string | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  // Solo-UX: refleja el guard server-side (app_can('Seguridad','edit')). Con VER
  // pero sin EDITAR, los controles se ven pero quedan inertes. La autoridad real
  // sigue siendo el backend (roles.ts → app_can). No es un mecanismo de seguridad.
  const canEditSeguridad = useCan('Seguridad', 'edit');

  // Modal Action State
  const [userProfileModal, setUserProfileModal] = useState<any>(null);
  const [profileData, setProfileData] = useState({ full_name: '', role_id: '', is_active: false, email: '', employee_id: '' });
  const [newPassword, setNewPassword] = useState('');
  /** Alta: invitación por correo (default) o contraseña manual. */
  const [createMode, setCreateMode] = useState<'invite' | 'manual'>('invite');
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadInvitations = async () => {
    setInvitationsLoading(true);
    try {
      const res = await listUserInvitations(200);
      if (res.error) {
        notify.warning('No se pudieron cargar invitaciones', { description: res.error });
        setInvitations([]);
      } else {
        setInvitations(res.rows || []);
      }
    } catch (err: unknown) {
      notify.warning('No se pudieron cargar invitaciones', {
        description: err instanceof Error ? err.message : 'Error inesperado',
      });
      setInvitations([]);
    } finally {
      setInvitationsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'invitations') {
      void loadInvitations();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'roles' || activeTab === 'users') {
      loadRBACData();
    } else if (activeTab === 'audit') {
      loadAuditLogs();
    }
  }, [activeTab]);

  // C5: al cambiar la búsqueda volvemos a la primera página (la consulta es server-side).
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    if (activeTab === 'audit') loadAuditLogs();
  }, [page, filterSeverity, filterModule, filterAction, debouncedSearch]);

  useEffect(() => {
    if (selectedRole && activeTab === 'roles') {
      loadRolePermissions(selectedRole.id);
    }
  }, [selectedRole]);

  // ==========================================
  // DATA LOADERS
  // ==========================================
  const loadAuditLogs = async () => {
    setAuditLoading(true);
    const { data, count } = await getAdvancedAuditLogs({
      severity: filterSeverity || undefined,
      module: filterModule || undefined,
      action: filterAction || undefined,
      search: debouncedSearch || undefined,
      limit,
      offset: (page - 1) * limit
    });
    setLogs(data || []);
    setTotalLogs(count || 0);
    setAuditLoading(false);
  };

  const loadRBACData = async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      if (supabase) {
        const { data: emps } = await supabase
          .from('employees')
          .select('id, codigo_empleado, nombre_completo, email')
          .order('nombre_completo');
        if (emps) setHrEmployees(emps);
      }

      const rolesResult = await getRoles();
      const rolesData = rolesResult.roles || [];

      if (rolesResult.error) {
        setDbError(rolesResult.error);
      } else if (!rolesData.length) {
        setDbError(
          'No hay puestos/roles en hr_positions. Crea cargos en RRHH → Catálogos, o revisa la sincronización de roles.'
        );
      } else {
        setDbError(null);
      }
      setRoles(rolesData);
      if (rolesData.length > 0 && !selectedRole) setSelectedRole(rolesData[0]);

      const usersData = await getUsersWithRoles();
      setUsers(usersData);
    } catch (e: unknown) {
      setDbError(e instanceof Error ? e.message : 'Error fatal de Base de Datos');
    }
  };

  const loadRolePermissions = async (roleId: string) => {
    const perms = await getRolePermissions(roleId);
    setPermissions(perms);
  };

  // ==========================================
  // RBAC ACTIONS
  // ==========================================
  const handleTogglePermission = async (moduleName: string, field: string, currentValue: boolean) => {
    if (!selectedRole) return;
    if (!canEditSeguridad) {
      notify.warning('Solo lectura', { description: 'No tienes permiso para editar permisos del módulo Seguridad.' });
      return;
    }
    const newValue = !currentValue;
    const permKey = `${moduleName}-${field}`;
    setSavingPerm(permKey);
    
    // Update Optimistically
    const existingIdx = permissions.findIndex(p => p.module_name === moduleName);
    let newPerms = [...permissions];
    if (existingIdx >= 0) {
      newPerms[existingIdx] = { ...newPerms[existingIdx], [field]: newValue };
    } else {
      newPerms.push({ module_name: moduleName, [field]: newValue });
    }
    setPermissions(newPerms);

    // Persist
    await updateRolePermission(selectedRole.id, moduleName, field, newValue);
    
    // Log Audit
    await logAdvancedAudit({
      module: 'Seguridad',
      tableName: 'erp_role_permissions',
      recordId: selectedRole.id,
      action: 'Cambio de Permiso',
      severity: 'WARNING',
      observations: `Rol ${selectedRole.name}: Módulo ${moduleName} -> ${field} cambiado a ${newValue}`
    });

    setSavingPerm(null);
  };

  // ==========================================
  // USER ACTIONS
  // ==========================================
  const handleOpenProfile = (user: any) => {
    setUserProfileModal(user);
    setProfileData({
      full_name: user.full_name || '',
      role_id: user.role_id || '',
      is_active: user.status === 'Activo',
      email: user.email || '',
      employee_id: user.employee_id || ''
    });
    setProfilePreview(user.avatar_url || null);
    setProfileFile(null);
    setNewPassword('');
  };

  const handleOpenCreateProfile = () => {
    setUserProfileModal({ isNew: true });
    setProfileData({
      full_name: '',
      role_id: '',
      is_active: true,
      email: '',
      employee_id: ''
    });
    setProfilePreview(null);
    setProfileFile(null);
    setNewPassword('');
    setCreateMode('invite');
  };

  /** Reabre el modal de invitación desde una fila (p. ej. revoked / correo inválido). */
  const handleOpenInviteFromInvitation = (inv: UserInvitationRow) => {
    const emailOk = isValidAuthEmail(inv.email);
    setUserProfileModal({ isNew: true });
    setProfileData({
      full_name: inv.full_name || '',
      role_id: inv.role_id || '',
      is_active: true,
      // Si el correo era inválido ("urbano"), dejar vacío para forzar el completo.
      email: emailOk ? inv.email : '',
      employee_id: inv.employee_id || '',
    });
    setProfilePreview(null);
    setProfileFile(null);
    setNewPassword('');
    setCreateMode('invite');
    if (!emailOk) {
      notify.info('Corrige el correo', {
        description:
          'El registro anterior no tenía dominio. Escribe el correo completo (ej. gurbano24@gmail.com) y guarda.',
      });
    }
  };

  /** Dominio de correo de ingreso (siempre corporativo TC). */
  const resolveCompanyEmailDomain = (): string => 'techcorps.com';

  /**
   * Genera correo de ingreso si RRHH no lo tiene.
   * LATAM: inicial del nombre + apellido paterno → sveliz@dominio
   * (STEVEN OTTONIEL VELIZ LOPEZ → sveliz@…)
   */
  const suggestLoginEmail = (nombreCompleto: string, codigoEmpleado: string, domain: string): string => {
    const parts = nombreCompleto
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

    let local = '';
    if (parts.length >= 4) {
      // 2 nombres + 2 apellidos → inicial + apellido paterno
      local = `${parts[0][0]}${parts[parts.length - 2]}`;
    } else if (parts.length === 3) {
      // 1 nombre + 2 apellidos → inicial + apellido paterno
      local = `${parts[0][0]}${parts[1]}`;
    } else if (parts.length === 2) {
      local = `${parts[0]}.${parts[1]}`;
    } else if (parts.length === 1) {
      local = parts[0];
    }

    if (!local && codigoEmpleado) {
      local = codigoEmpleado.toLowerCase().replace(/[^a-z0-9]/g, '');
    }
    if (!local) return '';
    return `${local}@${domain}`;
  };

  /**
   * Al enlazar empleado RRHH → nombre + correo (del expediente o generado para ingreso).
   */
  const applyEmployeeToProfile = async (
    employeeId: string,
    fromOption?: { name?: string; email?: string; label?: string }
  ) => {
    if (!employeeId) {
      setProfileData((prev) => ({
        ...prev,
        employee_id: '',
        full_name: '',
        email: '',
      }));
      return;
    }

    const nameFromLabel = (label: string): string => {
      let s = label.replace(/\s*\([^)]*@[^)]*\)\s*$/u, '').trim();
      s = s.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
      const parts = s.split(/\s*[-–—]\s*/);
      if (parts.length >= 2) {
        const head = parts[0].trim();
        if (/^EMP-\d+/i.test(head) || /^[A-Z]{2,6}-\d+/i.test(head)) {
          return parts.slice(1).join(' - ').trim();
        }
        return parts.slice(1).join(' - ').trim();
      }
      return s;
    };

    const emailFromLabel = (label: string): string => {
      const m = label.match(/\(([^)]+@[^)]+)\)\s*$/u);
      return m?.[1]?.trim().toLowerCase() || '';
    };

    let emp = hrEmployees.find((e) => String(e.id) === String(employeeId)) || null;

    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data: fresh, error } = await supabase
        .from('employees')
        .select('id, codigo_empleado, nombre_completo, email')
        .eq('id', employeeId)
        .maybeSingle();
      if (!error && fresh) {
        emp = fresh;
        setHrEmployees((prev) => {
          const i = prev.findIndex((e) => String(e.id) === String(employeeId));
          if (i < 0) return [...prev, fresh];
          const next = [...prev];
          next[i] = { ...next[i], ...fresh };
          return next;
        });
      }
    }

    const fullName = String(
      emp?.nombre_completo ||
        fromOption?.name ||
        (fromOption?.label ? nameFromLabel(fromOption.label) : '') ||
        ''
    ).trim();

    const codigo = String(emp?.codigo_empleado || '').trim();
    const emailFromDb = String(
      emp?.email || fromOption?.email || (fromOption?.label ? emailFromLabel(fromOption.label) : '') || ''
    )
      .trim()
      .toLowerCase();

    const domain = resolveCompanyEmailDomain();
    const suggested = !emailFromDb && fullName ? suggestLoginEmail(fullName, codigo, domain) : '';
    const email = emailFromDb || suggested;

    setProfileData((prev) => ({
      ...prev,
      employee_id: employeeId,
      full_name: fullName,
      email,
    }));

    if (!emailFromDb && email) {
      notify.info('Correo generado para ingreso', {
        description: `Se propuso ${email}. Puedes editarlo antes de guardar.`,
      });
    }
  };

  // Completar nombre/correo si el empleado ya está elegido y faltan datos.
  useEffect(() => {
    if (!userProfileModal?.isNew) return;
    if (!profileData.employee_id) return;
    if (hrEmployees.length === 0) return;

    const needsName = !String(profileData.full_name || '').trim();
    const needsEmail = !String(profileData.email || '').trim();
    if (!needsName && !needsEmail) return;

    const emp = hrEmployees.find((e) => String(e.id) === String(profileData.employee_id));
    if (!emp) return;

    const name = String(emp.nombre_completo || '').trim();
    const codigo = String(emp.codigo_empleado || '').trim();
    const emailFromDb = String(emp.email || '').trim().toLowerCase();
    const domain = resolveCompanyEmailDomain();
    const email = emailFromDb || (name ? suggestLoginEmail(name, codigo, domain) : '');

    if ((needsName && !name) && (needsEmail && !email)) return;

    setProfileData((prev) => ({
      ...prev,
      full_name: needsName ? name || prev.full_name : prev.full_name,
      email: needsEmail ? email || prev.email : prev.email,
    }));
  }, [
    userProfileModal?.isNew,
    profileData.employee_id,
    profileData.full_name,
    profileData.email,
    hrEmployees,
  ]);

  const handleSaveProfile = async () => {
    if (!userProfileModal) return;
    if (!canEditSeguridad) {
      notify.warning('Solo lectura', { description: 'No tienes permiso para editar usuarios desde Seguridad.' });
      return;
    }
    setActionLoading(true);
    let avatar_url = userProfileModal.avatar_url;

    // 1. Upload Avatar si hay uno nuevo
    if (profileFile) {
      const targetId = userProfileModal.id || 'new'; // This might fail for new users if storage depends on ID
      if (!userProfileModal.isNew) {
        const res = await uploadAvatar(userProfileModal.id, profileFile);
        if (res.error) {
          notify.error('Error al subir foto', { description: res.error });
          setActionLoading(false);
          return;
        }
        avatar_url = res.url;
      }
    }

    if (userProfileModal.isNew) {
      // Empleado RRHH es opcional: basta con nombre + correo + rol (p. ej. invitación).
      if (!profileData.email || !profileData.full_name) {
        notify.warning('Datos incompletos', {
          description: profileData.employee_id
            ? 'Falta correo o nombre.'
            : 'Indica nombre y correo, o selecciona un empleado RRHH para autocompletarlos.',
        });
        setActionLoading(false);
        return;
      }
      if (!isValidAuthEmail(profileData.email)) {
        notify.warning('Correo incompleto', {
          description:
            'Usa el correo completo con dominio (ej. gurbano24@gmail.com). No basta con el usuario sin @.',
        });
        setActionLoading(false);
        return;
      }
      if (createMode === 'manual' && !newPassword) {
        notify.warning('Datos incompletos', {
          description: 'Falta la contraseña (modo asignación manual).',
        });
        setActionLoading(false);
        return;
      }
      if (!profileData.role_id) {
        notify.warning('Rol requerido', { description: 'Selecciona el rol en el sistema.' });
        setActionLoading(false);
        return;
      }

      const res =
        createMode === 'invite'
          ? await adminInviteUser(
              profileData.email,
              profileData.full_name,
              profileData.role_id,
              profileData.employee_id || undefined,
              typeof window !== 'undefined' ? window.location.origin : undefined
            )
          : await adminCreateUser(
              profileData.email,
              newPassword,
              profileData.full_name,
              profileData.role_id,
              profileData.employee_id || undefined
            );

      if ('error' in res && res.error) {
        // warning: evita que humanizeUserFacingError oculte el mensaje de negocio
        // (p. ej. SITE_URL / localhost / rate limit) como "Sin permiso" genérico.
        notify.warning(
          createMode === 'invite' ? 'No se pudo invitar' : 'No se pudo crear el usuario',
          { description: res.error }
        );
        setActionLoading(false);
        if (createMode === 'invite') {
          setUserProfileModal(null);
          setActiveTab('invitations');
          await loadInvitations();
        }
        return;
      }

      if (createMode === 'invite') {
        const emailSent = 'emailSent' in res && res.emailSent === true;
        if (
          !emailSent &&
          'actionLink' in res &&
          typeof res.actionLink === 'string' &&
          res.actionLink
        ) {
          try {
            await navigator.clipboard.writeText(res.actionLink);
            notify.success('Enlace copiado', {
              description:
                ('message' in res && res.message) ||
                'El enlace quedó en el portapapeles. Envíalo por WhatsApp/correo.',
            });
          } catch {
            notify.success('Enlace listo', {
              description:
                ('message' in res && res.message) ||
                'Copia el enlace en Invitaciones.',
            });
          }
        } else {
          notify.success(emailSent ? 'Invitación enviada' : 'Enlace listo', {
            description:
              ('message' in res && res.message) ||
              (emailSent
                ? 'Correo enviado con marca TC ERP.'
                : 'Copia el enlace en Invitaciones y envíalo al usuario.'),
          });
        }
      } else if ('linked' in res && res.linked) {
        notify.success('Usuario enlazado', {
          description:
            ('message' in res && res.message) ||
            'La cuenta ya existía: se actualizó la clave y el vínculo con el empleado.',
        });
      } else {
        notify.success('Usuario creado', {
          description:
            ('message' in res && res.message) ||
            'Cuenta de acceso creada correctamente.',
        });
      }
      
      // If we uploaded a file for a new user, we'd need to upload it AFTER user creation
      if (profileFile && 'user' in res && res.user) {
        const uploadRes = await uploadAvatar(res.user.id, profileFile);
        if (!uploadRes.error) {
          await saveProfile({ id: res.user.id, avatar_url: uploadRes.url });
        }
      }

      if (createMode === 'invite') {
        setUserProfileModal(null);
        setActionLoading(false);
        setActiveTab('invitations');
        await loadInvitations();
        await loadRBACData();
        return;
      }
    } else {
      // Update existing user
      // 2. Guardar Nombre Completo, Avatar y Empleado
      if (profileData.full_name !== userProfileModal.full_name || avatar_url !== userProfileModal.avatar_url || profileData.employee_id !== userProfileModal.employee_id) {
         await saveProfile({ id: userProfileModal.id, full_name: profileData.full_name, avatar_url, employee_id: profileData.employee_id || null });
      }

      // 3. Cambiar Rol
      if (profileData.role_id && profileData.role_id !== userProfileModal.role_id) {
         const r = roles.find(ro => ro.id === profileData.role_id);
         if (r) {
           const res = await changeUserRole(userProfileModal.id, r.id, r.name);
           if (res.error) {
             notify.error('Error cambiando rol', { description: res.error });
             setActionLoading(false);
             return;
           }
           notify.success('Rol actualizado', {
             description: `El usuario quedó con el puesto ${r.name}.`,
           });
         }
      }

      // 4. Cambiar Estado
      const currentActive = userProfileModal.status === 'Activo';
      if (profileData.is_active !== currentActive) {
         await adminToggleUserStatus(userProfileModal.id, profileData.is_active);
      }

      // 5. Resetear Contraseña (si se escribió algo)
      if (newPassword.length >= 6) {
         await adminUpdateUserPassword(userProfileModal.id, newPassword);
      }
    }

    await loadRBACData();
    setUserProfileModal(null);
    setActionLoading(false);
  };

  const handleToggleAccountStatus = async (user: {
    id: string;
    full_name?: string | null;
    email?: string | null;
    status?: string;
  }) => {
    const isActive = user.status === 'Activo';
    const nextActive = !isActive;
    const label = user.full_name || user.email || 'este usuario';
    const ok = await confirmDialog({
      title: nextActive ? 'Activar cuenta' : 'Desactivar cuenta',
      message: nextActive
        ? `¿Reactivar el acceso de ${label}?`
        : `¿Desactivar la cuenta de ${label}? No podrá iniciar sesión hasta reactivarla.`,
      tone: nextActive ? 'warning' : 'error',
      confirmText: nextActive ? 'Activar' : 'Desactivar',
    });
    if (!ok) return;

    setActionLoading(true);
    try {
      const res = await adminToggleUserStatus(user.id, nextActive);
      if (res?.error) {
        notify.error('No se pudo cambiar el estatus', { description: res.error });
      } else {
        notify.success(nextActive ? 'Cuenta activada' : 'Cuenta desactivada', {
          description: label,
        });
        await loadRBACData();
      }
    } catch (err: any) {
      notify.error('Error al cambiar estatus', { description: err?.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (user: {
    id: string;
    full_name?: string | null;
    email?: string | null;
  }) => {
    if (!canEditSeguridad) return;
    const label = user.full_name || user.email || 'este usuario';
    const ok = await confirmDialog({
      title: 'Eliminar usuario',
      message: `¿Eliminar permanentemente la cuenta de ${label} (${user.email || 'sin correo'})? No podrá iniciar sesión. El empleado RRHH no se borra.`,
      tone: 'error',
      confirmText: 'Eliminar',
    });
    if (!ok) return;

    setActionLoading(true);
    try {
      const res = await adminDeleteUser(user.id);
      if (res?.error) {
        notify.warning('No se pudo eliminar', { description: res.error });
        return;
      }
      notify.success('Usuario eliminado', {
        description: res.message || label,
      });
      if (userProfileModal && !userProfileModal.isNew && userProfileModal.id === user.id) {
        setUserProfileModal(null);
      }
      await loadRBACData();
      await loadInvitations();
    } catch (err: unknown) {
      notify.error('Error al eliminar', {
        description: err instanceof Error ? err.message : 'Error desconocido',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const exportToExcel = () => {
    if (logs.length === 0) return;
    const exportData = logs.map(log => ({
      'Fecha': new Date(log.created_at).toLocaleString(),
      'Usuario': log.profiles?.full_name || 'Desconocido',
      'Rol': log.user_role,
      'Sucursal': log.branch_id || 'N/A',
      'Módulo': log.module,
      'Tabla': log.table_name,
      'Registro ID': log.record_id,
      'Acción': log.action,
      'Severidad': log.severity,
      'IP': log.ip_address || '',
      'Dispositivo': log.user_agent || '',
      'Observaciones': log.observations || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Auditoría");
    XLSX.writeFile(workbook, `Auditoria_ERP_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // ==========================================
  // RENDERS
  // ==========================================
  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return <Badge className="bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]/20 font-black"><ShieldAlert size={12} className="mr-1"/> CRITICAL</Badge>;
      case 'WARNING': return <Badge className="bg-[var(--warning)]/15 text-[var(--warning)] border-[var(--warning)]/20 font-black"><AlertTriangle size={12} className="mr-1"/> WARNING</Badge>;
      default: return <Badge className="bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/20 font-black"><Info size={12} className="mr-1"/> INFO</Badge>;
    }
  };

  // Filtrado de Usuarios para la pestaña "users"
  const filteredUsers = users.filter(u => {
    if (!userSearch) return true;
    const term = userSearch.toLowerCase();
    return u.full_name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || u.role?.toLowerCase().includes(term);
  });

  const usersTotalCount = filteredUsers.length;
  const usersTotalPages = Math.max(1, Math.ceil(usersTotalCount / USERS_PAGE_SIZE) || 1);
  const usersSafePage = Math.min(usersPage, usersTotalPages);
  const usersPageItems = filteredUsers.slice(
    (usersSafePage - 1) * USERS_PAGE_SIZE,
    usersSafePage * USERS_PAGE_SIZE
  );
  const usersStartItem = usersTotalCount === 0 ? 0 : (usersSafePage - 1) * USERS_PAGE_SIZE + 1;
  const usersEndItem = Math.min(usersSafePage * USERS_PAGE_SIZE, usersTotalCount);

  useEffect(() => {
    setUsersPage(1);
  }, [userSearch]);

  useEffect(() => {
    if (usersPage > usersTotalPages) setUsersPage(usersTotalPages);
  }, [usersPage, usersTotalPages]);

  // Empleados RRHH que aún no tienen cuenta de acceso (employee_id ya enlazado).
  const linkedEmployeeIds = new Set(
    users
      .map((u) => u.employee_id)
      .filter((id): id is string => Boolean(id))
      .map((id) => String(id))
  );

  const hrEmployeesWithoutAccount = hrEmployees.filter(
    (e) => !linkedEmployeeIds.has(String(e.id))
  );

  // En edición: libres + el empleado ya enlazado a este perfil (para no perderlo del select).
  const hrEmployeesAvailableToLink = hrEmployees.filter((e) => {
    const id = String(e.id);
    if (profileData.employee_id && id === String(profileData.employee_id)) return true;
    return !linkedEmployeeIds.has(id);
  });

  // Usuarios del rol actual para la pestaña "roles"
  const roleUsers = users.filter(u => u.role_id === selectedRole?.id || u.role === selectedRole?.name);

  return (
    <ModulePage
      title="Seguridad Corporativa"
      category="Enterprise Management"
    >
      <div className="flex items-center gap-4 mb-6 border-b border-[var(--border)]">
        <button 
          onClick={() => setActiveTab('users')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'users' ? 'text-[var(--heading)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
        >
          <div className="flex items-center gap-2">
            <UserCog className="w-4 h-4" />
            Gestión de Usuarios
          </div>
          {activeTab === 'users' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[var(--accent)] rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('roles')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'roles' ? 'text-[var(--heading)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Roles y Permisos
          </div>
          {activeTab === 'roles' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[var(--accent)] rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('invitations')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'invitations' ? 'text-[var(--heading)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
        >
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Invitaciones
          </div>
          {activeTab === 'invitations' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[var(--accent)] rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('audit')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'audit' ? 'text-[var(--heading)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]'}`}
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Auditoría Avanzada
          </div>
          {activeTab === 'audit' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[var(--accent)] rounded-t-full" />}
        </button>
      </div>

      {dbError && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border-2 border-rose-200 bg-rose-50 p-4 text-rose-700">
          <AlertTriangle size={24} className="shrink-0" />
          <div>
            <h4 className="font-bold">No se pudo cargar Seguridad</h4>
            <p className="text-sm">{dbError}</p>
          </div>
        </div>
      )}

      {!canEditSeguridad && activeTab !== 'audit' && (
        <div className="mb-6 bg-amber-50 border-2 border-amber-200 text-amber-800 p-4 rounded-xl flex items-center gap-3">
          <Eye size={22} />
          <div>
            <h4 className="font-bold">Modo solo lectura</h4>
            <p className="text-sm">Puedes consultar roles, permisos y usuarios, pero no modificarlos. Requiere el permiso <strong>EDITAR</strong> en el módulo Seguridad.</p>
          </div>
        </div>
      )}

      {/* PESTAÑA: INVITACIONES */}
      {activeTab === 'invitations' && (
        <div className="space-y-6 animate-rise-in">
          <Card padding="none" className="overflow-hidden shadow-xl border-2 border-slate-100 flex flex-col min-h-[480px]">
            <div className="p-5 border-b border-[var(--border)] bg-[var(--surface-hover)] flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h3 className="font-black text-[var(--heading)] text-sm uppercase tracking-widest flex items-center gap-2">
                  <Mail size={18} className="text-[var(--accent)]" />
                  Control de invitaciones
                </h3>
                <p className="text-xs text-[var(--muted)] mt-1">
                  Correo destinatario, rol, estado y parámetros del enlace (sin marca de proveedor).
                </p>
              </div>
              <div className="flex gap-3 items-center w-full md:w-auto">
                <div className="relative flex-1 md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                  <input
                    type="text"
                    placeholder="Buscar correo o nombre..."
                    value={invitationSearch}
                    onChange={(e) => setInvitationSearch(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] text-sm font-medium outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <Button
                  variant="outline"
                  disabled={invitationsLoading}
                  onClick={() => void loadInvitations()}
                  className="h-10 px-3"
                  title="Actualizar lista"
                >
                  <RefreshCw size={16} className={invitationsLoading ? 'animate-spin' : ''} />
                </Button>
                <Button
                  disabled={!canEditSeguridad}
                  className="h-10 px-3 bg-[var(--heading)] text-[var(--surface)]"
                  onClick={() => {
                    handleOpenCreateProfile();
                  }}
                >
                  <Plus size={16} className="mr-1" /> Invitar
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[var(--surface-hover)] text-[10px] uppercase tracking-widest text-[var(--muted)]">
                  <tr>
                    <th className="text-left px-4 py-3 font-black">Correo</th>
                    <th className="text-left px-4 py-3 font-black">Nombre</th>
                    <th className="text-left px-4 py-3 font-black">Rol</th>
                    <th className="text-left px-4 py-3 font-black">Estado</th>
                    <th className="text-left px-4 py-3 font-black">Base URL</th>
                    <th className="text-left px-4 py-3 font-black">Enviado</th>
                    <th className="text-right px-4 py-3 font-black">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {invitationsLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-[var(--muted)]">
                        Cargando invitaciones…
                      </td>
                    </tr>
                  ) : invitations.filter((inv) => {
                      const q = invitationSearch.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        inv.email.toLowerCase().includes(q) ||
                        inv.full_name.toLowerCase().includes(q) ||
                        (inv.role_name || '').toLowerCase().includes(q)
                      );
                    }).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <p className="text-sm font-semibold text-[var(--heading)]">
                          Aún no hay invitados en la tabla
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted)] max-w-md mx-auto">
                          Los intentos anteriores fallaron antes de registrarse. Usa{' '}
                          <strong>Invitar</strong> (modo correo), y al guardar verás aquí el
                          correo con botones <strong>Reenviar</strong> y <strong>Revocar</strong>.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    invitations
                      .filter((inv) => {
                        const q = invitationSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          inv.email.toLowerCase().includes(q) ||
                          inv.full_name.toLowerCase().includes(q) ||
                          (inv.role_name || '').toLowerCase().includes(q)
                        );
                      })
                      .map((inv) => (
                        <tr key={inv.id} className="border-t border-[var(--border)] hover:bg-[var(--surface-hover)]/60">
                          <td className="px-4 py-3 font-mono text-xs text-[var(--heading)]">{inv.email}</td>
                          <td className="px-4 py-3 font-semibold text-[var(--heading)]">{inv.full_name || '—'}</td>
                          <td className="px-4 py-3">
                            <Badge className="bg-[var(--surface-hover)] text-[var(--muted)] border-none font-bold text-[10px]">
                              {inv.role_name || 'Sin rol'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              title={inv.last_error || undefined}
                              className={
                                inv.status === 'pending' || inv.status === 'resent'
                                  ? 'bg-amber-100 text-amber-800 border-none'
                                  : inv.status === 'failed' || inv.status === 'revoked'
                                    ? 'bg-rose-100 text-rose-800 border-none'
                                    : 'bg-emerald-100 text-emerald-800 border-none'
                              }
                            >
                              {inv.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 max-w-[180px] truncate font-mono text-[10px] text-[var(--muted)]" title={inv.redirect_base || ''}>
                            {inv.redirect_base || '—'}
                          </td>
                          <td className="px-4 py-3 text-xs text-[var(--muted)] whitespace-nowrap">
                            {new Date(inv.last_sent_at || inv.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex flex-wrap justify-end gap-2">
                              {typeof inv.params?.action_link === 'string' && inv.params.action_link && (
                                <Button
                                  variant="outline"
                                  className="h-8 px-2 text-[10px] font-bold"
                                  onClick={async () => {
                                    try {
                                      await navigator.clipboard.writeText(
                                        String(inv.params.action_link)
                                      );
                                      notify.success('Enlace copiado', {
                                        description:
                                          'Pégalo en el navegador del invitado (válido por tiempo limitado).',
                                      });
                                    } catch {
                                      notify.warning('No se pudo copiar', {
                                        description: String(inv.params.action_link),
                                      });
                                    }
                                  }}
                                >
                                  Copiar enlace
                                </Button>
                              )}
                              {inv.status === 'revoked' || !isValidAuthEmail(inv.email) ? (
                                <Button
                                  variant="outline"
                                  disabled={!canEditSeguridad || actionLoading}
                                  className="h-8 px-2 text-[10px] font-bold"
                                  onClick={() => {
                                    if (!canEditSeguridad) return;
                                    handleOpenInviteFromInvitation(inv);
                                  }}
                                >
                                  Invitar de nuevo
                                </Button>
                              ) : (
                                <Button
                                  variant="outline"
                                  disabled={!canEditSeguridad || actionLoading}
                                  className="h-8 px-2 text-[10px] font-bold"
                                  onClick={async () => {
                                    if (!canEditSeguridad) return;
                                    setActionLoading(true);
                                    const res = await adminInviteUser(
                                      inv.email,
                                      inv.full_name || inv.email,
                                      inv.role_id || undefined,
                                      inv.employee_id || undefined,
                                      typeof window !== 'undefined'
                                        ? window.location.origin
                                        : undefined
                                    );
                                    setActionLoading(false);
                                    await loadInvitations();
                                    if ('error' in res && res.error) {
                                      notify.warning('No se pudo reenviar', {
                                        description: res.error,
                                      });
                                      return;
                                    }
                                    const emailSent =
                                      'emailSent' in res && res.emailSent === true;
                                    if (
                                      !emailSent &&
                                      'actionLink' in res &&
                                      typeof res.actionLink === 'string' &&
                                      res.actionLink
                                    ) {
                                      try {
                                        await navigator.clipboard.writeText(res.actionLink);
                                        notify.success('Enlace regenerado y copiado', {
                                          description:
                                            ('message' in res && res.message) ||
                                            'Pégalo en WhatsApp o correo del invitado.',
                                        });
                                      } catch {
                                        notify.success('Enlace regenerado', {
                                          description:
                                            ('message' in res && res.message) ||
                                            'Usa “Copiar enlace”.',
                                        });
                                      }
                                    } else {
                                      notify.success(
                                        emailSent
                                          ? 'Invitación reenviada'
                                          : 'Enlace regenerado',
                                        {
                                          description:
                                            ('message' in res && res.message) ||
                                            (emailSent
                                              ? 'Correo enviado.'
                                              : 'Usa “Copiar enlace” si no hay Resend configurado.'),
                                        }
                                      );
                                    }
                                  }}
                                >
                                  Reenviar
                                </Button>
                              )}
                              {(inv.status === 'pending' ||
                                inv.status === 'resent' ||
                                inv.status === 'failed') && (
                                <Button
                                  variant="ghost"
                                  disabled={!canEditSeguridad || actionLoading}
                                  className="h-8 px-2 text-[10px] font-bold text-rose-600"
                                  onClick={async () => {
                                    const ok = await confirmDialog({
                                      title: 'Revocar invitación',
                                      message: `¿Marcar como revocada la invitación a ${inv.email}?`,
                                      tone: 'error',
                                      confirmText: 'Revocar',
                                    });
                                    if (!ok) return;
                                    setActionLoading(true);
                                    const res = await revokeUserInvitation(inv.id);
                                    setActionLoading(false);
                                    if (res.error) {
                                      notify.warning('No se pudo revocar', {
                                        description: res.error,
                                      });
                                      return;
                                    }
                                    notify.success('Invitación revocada');
                                    await loadInvitations();
                                  }}
                                >
                                  Revocar
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                disabled={!canEditSeguridad || actionLoading}
                                className="h-8 px-2 text-[10px] font-bold text-rose-700"
                                onClick={async () => {
                                  if (!canEditSeguridad) return;
                                  const ok = await confirmDialog({
                                    title: 'Eliminar invitación',
                                    message: `¿Eliminar de la tabla la invitación a ${inv.email}? No borra la cuenta Auth; solo el registro de control.`,
                                    tone: 'error',
                                    confirmText: 'Eliminar',
                                  });
                                  if (!ok) return;
                                  setActionLoading(true);
                                  const res = await deleteUserInvitation(inv.id);
                                  setActionLoading(false);
                                  if (res.error) {
                                    notify.warning('No se pudo eliminar', {
                                      description: res.error,
                                    });
                                    return;
                                  }
                                  notify.success('Invitación eliminada');
                                  await loadInvitations();
                                }}
                              >
                                Eliminar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
            {invitations.some((i) => i.status === 'failed') && (
              <div className="p-4 border-t border-[var(--border)] bg-rose-50/50 text-xs text-rose-800 space-y-1">
                <p>
                  Hay invitaciones fallidas. Usa <strong>Invitar de nuevo</strong> (o + Invitar)
                  con el correo completo (@dominio). En móvil define{' '}
                  <code className="font-mono">NEXT_PUBLIC_SITE_URL</code> (no localhost).
                </p>
                {invitations
                  .filter((i) => i.status === 'failed' && i.last_error)
                  .slice(0, 3)
                  .map((i) => (
                    <p
                      key={i.id}
                      className="font-mono text-[10px] text-rose-700/90 truncate"
                      title={i.last_error || ''}
                    >
                      {i.email}: {i.last_error}
                    </p>
                  ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* PESTAÑA 1: USUARIOS */}
      {activeTab === 'users' && (
        <div className="space-y-6 animate-rise-in">
          <Card padding="none" className="overflow-hidden shadow-xl shadow-slate-200/50 border-2 border-slate-100 flex flex-col min-h-[600px]">
            <div className="p-5 border-b border-[var(--border)] bg-[var(--surface-hover)] flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h3 className="font-black text-[var(--heading)] text-sm uppercase tracking-widest flex items-center gap-2">
                  <UserCog size={18} className="text-[var(--accent)]" />
                  Directorio de Cuentas
                </h3>
                <p className="text-xs text-[var(--muted)] mt-1">Administra accesos, contraseñas y roles del personal.</p>
              </div>
              <div className="flex gap-4 items-center">
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                  <input 
                    type="text" 
                    placeholder="Buscar por nombre, correo o rol..." 
                    value={userSearch}
                    onChange={e => {
                      setUserSearch(e.target.value);
                      setUsersPage(1);
                    }}
                    className="w-full h-10 pl-10 pr-4 bg-[var(--surface)] border-2 border-[var(--border)] rounded-lg text-xs font-bold outline-none focus:border-[var(--accent)] transition-all"
                  />
                </div>
                <Button variant="primary" className="gap-2 shrink-0" onClick={handleOpenCreateProfile} disabled={!canEditSeguridad}>
                  <Plus className="w-4 h-4" /> Nuevo Usuario
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[var(--surface-hover)] text-[var(--muted)] text-[10px] font-black uppercase tracking-widest sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 rounded-tl-xl">Empleado</th>
                    <th className="px-6 py-4">Correo</th>
                    <th className="px-6 py-4 text-center">Rol Asignado</th>
                    <th className="px-6 py-4 text-center">Estatus</th>
                    <th className="px-6 py-4 text-center rounded-tr-xl">Acciones de Seguridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {usersPageItems.map(user => (
                    <tr key={user.id} className="hover:bg-[var(--surface-hover)]/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--surface-hover)] flex-shrink-0">
                            {user.avatar_url ? (
                              <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-[var(--heading)] text-[var(--surface)] text-xs font-black uppercase">
                                {user.full_name ? user.full_name.substring(0, 2) : 'US'}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-[var(--heading)]">{user.full_name || 'Sin Nombre'}</div>
                            {user.employee_code && (
                              <div className="text-[10px] text-[var(--success)] font-bold bg-[var(--success)]/15 px-1.5 py-0.5 rounded inline-block mt-0.5">
                                RRHH: {user.employee_code}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Badge className="bg-[var(--surface-hover)] text-[var(--foreground)] border-[var(--border)]">
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {user.status === 'Activo' ? (
                          <Badge className="bg-[var(--success)]/15 text-[var(--success)] border-[var(--success)]/20"><CheckCircle2 size={12} className="mr-1"/> Activo</Badge>
                        ) : (
                          <Badge className="bg-[var(--danger)]/15 text-[var(--danger)] border-[var(--danger)]/20"><Ban size={12} className="mr-1"/> Suspendido</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center justify-center gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleOpenProfile(user)}
                            disabled={actionLoading}
                            className="h-8 border-[var(--border)] text-[var(--heading)] hover:bg-[var(--heading)] hover:text-[var(--surface)] hover:border-[var(--heading)]"
                          >
                            <Edit2 size={14} className="mr-2" /> Editar Perfil
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleToggleAccountStatus(user)}
                            disabled={actionLoading}
                            className={
                              user.status === 'Activo'
                                ? 'h-8 border-rose-200 text-rose-700 hover:bg-rose-50 hover:border-rose-300'
                                : 'h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-300'
                            }
                            title={user.status === 'Activo' ? 'Desactivar cuenta' : 'Activar cuenta'}
                          >
                            {user.status === 'Activo' ? (
                              <>
                                <UserX size={14} className="mr-2" /> Desactivar
                              </>
                            ) : (
                              <>
                                <UserCheck size={14} className="mr-2" /> Activar
                              </>
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => void handleDeleteUser(user)}
                            disabled={actionLoading || !canEditSeguridad}
                            className="h-8 border-rose-300 text-rose-800 hover:bg-rose-100 hover:border-rose-400"
                            title="Eliminar usuario"
                          >
                            <Trash2 size={14} className="mr-2" /> Eliminar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {usersPageItems.length === 0 && (
                     <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-slate-400 font-medium">No se encontraron usuarios</td>
                     </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              totalCount={usersTotalCount}
              page={usersSafePage}
              totalPages={usersTotalPages}
              startItem={usersStartItem}
              endItem={usersEndItem}
              pageSize={USERS_PAGE_SIZE}
              onPageChange={setUsersPage}
              itemLabel="usuarios"
            />
          </Card>
        </div>
      )}

      {/* PESTAÑA 2: ROLES */}
      {activeTab === 'roles' && (
        <div className="flex flex-col lg:flex-row gap-6 animate-rise-in h-auto min-h-[700px]">
          
          {/* COLUMNA 1: LISTA DE ROLES */}
          <Card className="w-full lg:w-64 shrink-0 flex flex-col p-4 shadow-xl shadow-slate-200/50 border-2 border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-[var(--heading)] tracking-tight">ROLES</h3>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-[var(--border)] text-[var(--accent)]"><Plus size={16} /></Button>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
              <input 
                type="text" 
                placeholder="Buscar rol..." 
                value={roleSearch}
                onChange={e => setRoleSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg text-xs outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {roles.filter(r => r.name.toLowerCase().includes(roleSearch.toLowerCase())).map(role => (
                <div 
                  key={role.id}
                  onClick={() => setSelectedRole(role)}
                  className={`p-3 rounded-xl cursor-pointer border-2 transition-all ${selectedRole?.id === role.id ? 'bg-[var(--surface-hover)] border-[var(--accent)] text-[var(--heading)] shadow-md' : 'bg-[var(--surface)] border-transparent hover:border-[var(--border)] text-[var(--foreground)]'}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">{role.name}</span>
                    {role.is_system && <ShieldCheck size={14} className={selectedRole?.id === role.id ? "text-[var(--accent)]" : "text-[var(--warning)]"} />}
                  </div>
                  <span className="text-[10px] truncate block mt-1 text-[var(--muted)]">
                    {role.description || 'Sin descripción'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* COLUMNA 2: MATRIZ DE PERMISOS */}
          <Card padding="none" className="flex-1 flex flex-col shadow-xl shadow-slate-200/50 border-2 border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-[var(--border)] bg-[var(--surface-hover)] flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black text-[var(--heading)] flex items-center gap-2">
                  <Shield size={20} className="text-[var(--accent)]" />
                  Matriz de Permisos: {selectedRole?.name}
                </h2>
                <p className="text-xs text-[var(--muted)] mt-1">Habilita o deshabilita accesos a nivel de módulo.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="h-8 border-slate-200 text-slate-600" disabled={!canEditSeguridad}><Copy size={14} className="mr-2" /> Copiar Permisos</Button>
              </div>
            </div>
            
            <div className="overflow-x-auto p-0 flex-1">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[var(--surface-hover)] text-[var(--muted)] text-[10px] font-black uppercase tracking-widest sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 rounded-tl-xl">Módulo</th>
                    <th className="px-4 py-4 text-center">Ver</th>
                    <th className="px-4 py-4 text-center">Crear</th>
                    <th className="px-4 py-4 text-center">Editar</th>
                    <th className="px-4 py-4 text-center">Eliminar</th>
                    <th className="px-4 py-4 text-center">Aprobar</th>
                    <th className="px-4 py-4 text-center rounded-tr-xl">Exportar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {PERMISSION_MATRIX_MODULES.map(module => {
                    const perm = permissions.find(p => p.module_name === module) || {};
                    return (
                      <tr key={module} className="hover:bg-[var(--surface-hover)]/50 transition-colors">
                        <td className="px-6 py-3 font-bold text-slate-700">{module}</td>
                        {['can_view', 'can_create', 'can_edit', 'can_delete', 'can_approve', 'can_export'].map(field => {
                          const isChecked = !!perm[field];
                          const isLoading = savingPerm === `${module}-${field}`;
                          return (
                            <td key={field} className="px-4 py-3 text-center">
                              <label className="relative inline-flex items-center cursor-pointer group">
                                <input 
                                  type="checkbox" 
                                  className="sr-only peer" 
                                  checked={isChecked}
                                  onChange={() => handleTogglePermission(module, field, isChecked)}
                                  disabled={isLoading || !canEditSeguridad}
                                />
                                <div className={`w-9 h-5 rounded-full peer peer-focus:ring-4 peer-focus:ring-[var(--accent)]/20 transition-all ${isChecked ? 'bg-[var(--success)]' : 'bg-[var(--surface-hover)]'} ${isLoading ? 'opacity-50' : ''}`}></div>
                                <div className={`absolute left-[2px] top-[2px] bg-[var(--surface)] border border-[var(--border)] w-4 h-4 rounded-full transition-all ${isChecked ? 'translate-x-full border-[var(--surface)]' : ''}`}></div>
                              </label>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* COLUMNA 3: USUARIOS Y SEGURIDAD */}
          <div className="w-full lg:w-80 shrink-0 flex flex-col gap-6">
            <Card className="flex-1 shadow-xl shadow-slate-200/50 border-2 border-slate-100 p-0 overflow-hidden flex flex-col">
              <div className="p-4 bg-[var(--surface-hover)] border-b border-[var(--border)] flex justify-between items-center">
                <h3 className="font-black text-[var(--heading)] text-sm uppercase tracking-widest flex items-center gap-2">
                  <Users size={16} className="text-[var(--accent)]" />
                  Usuarios ({roleUsers.length})
                </h3>
              </div>
              <div className="p-4 overflow-y-auto space-y-3 flex-1 min-h-[300px]">
                {roleUsers.length > 0 ? roleUsers.map(user => (
                  <div key={user.id} className="flex items-center justify-between p-3 border border-[var(--border)] rounded-xl bg-[var(--surface)] hover:border-[var(--accent)] transition-colors group">
                    <div>
                      <p className="text-xs font-bold text-[var(--heading)]">{user.full_name || 'Usuario'}</p>
                      <p className="text-[10px] text-[var(--muted)]">{user.email}</p>
                    </div>
                    {user.status === 'Activo' ? (
                        <Badge className="bg-[var(--success)]/15 text-[var(--success)] border-none scale-75 origin-right">Activo</Badge>
                    ) : (
                        <Badge className="bg-[var(--danger)]/15 text-[var(--danger)] border-none scale-75 origin-right">Inactivo</Badge>
                    )}
                  </div>
                )) : (
                  <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 p-6">
                     <Users size={32} className="mb-2 text-slate-200" />
                     <p className="text-xs font-medium">No hay usuarios asignados a este rol.</p>
                  </div>
                )}
              </div>
            </Card>

            <Card className="flex flex-col p-5 shadow-xl shadow-slate-200/50 border-2 border-[var(--border)] bg-[var(--surface)]">
              <h3 className="font-black text-[var(--heading)] text-sm uppercase tracking-widest flex items-center gap-2 mb-4 pb-4 border-b border-[var(--border)]">
                <Lock size={16} className="text-[var(--warning)]" />
                Políticas
              </h3>
              <p className="text-[10px] text-[var(--muted)] mb-4 leading-relaxed">Configuraciones de autenticación para miembros de este rol.</p>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[var(--foreground)]">Requerir 2FA</span>
                  <div className="w-8 h-4 bg-[var(--surface-hover)] rounded-full relative cursor-not-allowed opacity-50">
                    <div className="absolute left-1 top-0.5 w-3 h-3 bg-[var(--muted)] rounded-full"></div>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[var(--foreground)]">Forzar cambio</span>
                  <div className="w-8 h-4 bg-[var(--surface-hover)] rounded-full relative cursor-not-allowed opacity-50">
                    <div className="absolute left-1 top-0.5 w-3 h-3 bg-[var(--muted)] rounded-full"></div>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* PESTAÑA 3: AUDITORIA */}
      {activeTab === 'audit' && (
        <div className="space-y-6 animate-rise-in">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4 border-l-4 border-l-[var(--heading)] flex flex-col justify-center">
              <p className="text-xs font-black text-[var(--muted)] uppercase tracking-widest">Total Eventos</p>
              <h2 className="text-2xl font-bold text-[var(--heading)]">{totalLogs}</h2>
            </Card>
            <Card className="p-4 border-l-4 border-l-[var(--danger)] flex flex-col justify-center">
              <p className="text-xs font-black text-[var(--muted)] uppercase tracking-widest">Críticos Recientes</p>
              <h2 className="text-2xl font-bold text-[var(--danger)]">{logs.filter(l => l.severity === 'CRITICAL').length}</h2>
            </Card>
            <Card className="p-4 border-l-4 border-l-[var(--warning)] flex flex-col justify-center">
              <p className="text-xs font-black text-[var(--muted)] uppercase tracking-widest">Advertencias</p>
              <h2 className="text-2xl font-bold text-[var(--warning)]">{logs.filter(l => l.severity === 'WARNING').length}</h2>
            </Card>
            <Card className="p-4 border-l-4 border-l-[var(--accent)] flex flex-col justify-center">
              <p className="text-xs font-black text-[var(--muted)] uppercase tracking-widest">Exportar Datos</p>
              <Button onClick={exportToExcel} variant="outline" className="mt-2 w-full h-8 text-xs font-bold border-slate-200">
                <Download size={14} className="mr-2" />
                Excel (XLSX)
              </Button>
            </Card>
          </div>

          <Card padding="none" className="overflow-hidden border-2 border-slate-100 shadow-xl shadow-slate-200/50">
            <div className="p-5 border-b border-[var(--border)] bg-[var(--surface-hover)] flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
              <h3 className="text-sm font-black text-[var(--heading)] uppercase tracking-widest flex items-center gap-2">
                <Filter size={18} className="text-[var(--accent)]" />
                Filtros de Auditoría
              </h3>
              
              <div className="flex flex-wrap gap-2">
                <select 
                  value={filterSeverity} 
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="h-9 px-3 bg-[var(--surface)] border-2 border-[var(--border)] rounded-lg text-xs font-bold text-[var(--heading)] outline-none"
                >
                  <option value="">Todas</option>
                  <option value="INFO">INFO</option>
                  <option value="WARNING">WARNING</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>

                <div className="relative w-full md:w-64">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Search size={16} />
                  </div>
                  <input 
                    type="text"
                    placeholder="Buscar tabla o registro ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-9 pl-10 pr-4 bg-[var(--surface)] border-2 border-[var(--border)] rounded-lg text-xs font-bold text-[var(--heading)] outline-none focus:border-[var(--accent)] transition-all"
                  />
                </div>
              </div>
            </div>
            
            {auditLoading ? (
              <div className="p-10 text-center text-[var(--muted)] font-bold animate-pulse">Consultando el motor de auditoría...</div>
            ) : (
              <div className="overflow-x-auto min-h-[400px]">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-[var(--surface-hover)] text-[var(--muted)] text-[10px] font-black uppercase tracking-widest">
                    <tr>
                      <th className="px-6 py-4">Fecha/Hora</th>
                      <th className="px-6 py-4">Severidad</th>
                      <th className="px-6 py-4">Usuario</th>
                      <th className="px-6 py-4">Módulo</th>
                      <th className="px-6 py-4">Acción</th>
                      <th className="px-6 py-4">Tabla</th>
                      <th className="px-6 py-4">Registro ID</th>
                      <th className="px-6 py-4 text-center">Datos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {logs.map(log => (
                      <tr key={log.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                        <td className="px-6 py-3 text-slate-500 font-mono">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-3">
                          {getSeverityBadge(log.severity)}
                        </td>
                        <td className="px-6 py-3 font-bold text-[var(--heading)]">
                          {log.profiles?.full_name || 'SISTEMA'}
                          <span className="block text-[9px] text-[var(--muted)]">{log.user_role}</span>
                        </td>
                        <td className="px-6 py-3 font-bold text-[var(--foreground)]">
                          {log.module}
                        </td>
                        <td className="px-6 py-3">
                          <Badge className="bg-[var(--surface-hover)] text-[var(--foreground)] border-none font-bold">
                            {log.action}
                          </Badge>
                        </td>
                        <td className="px-6 py-3 font-mono text-[var(--foreground)]">
                          {log.table_name}
                        </td>
                        <td className="px-6 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--surface-hover)] border border-[var(--border)] rounded-md font-mono text-[10px] text-[var(--muted)]" title={log.record_id}>
                            <span className="text-[var(--muted)]">#</span>
                            {log.record_id ? (log.record_id.length > 8 ? log.record_id.substring(0, 8) : log.record_id) : 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-center">
                          <button 
                            onClick={() => setSelectedLog(log)}
                            className="p-1.5 bg-[var(--surface-hover)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--surface)] rounded-md transition-colors"
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            
            <div className="p-4 border-t border-[var(--border)] bg-[var(--surface)] flex justify-between items-center">
              <span className="text-xs font-bold text-[var(--muted)]">
                Página {page} de {Math.ceil(totalLogs / limit) || 1}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)} className="h-8 px-2"><ChevronLeft size={16} /></Button>
                <Button variant="outline" disabled={page >= Math.ceil(totalLogs / limit)} onClick={() => setPage(p => p + 1)} className="h-8 px-2"><ChevronRight size={16} /></Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Modal Perfil de Usuario */}
      {userProfileModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--heading)]/70 backdrop-blur-sm animate-fade-in p-4">
          <Card className="w-full max-w-2xl flex flex-col overflow-hidden shadow-2xl p-0">
            <div className="p-6 bg-[var(--surface)] border-b border-[var(--border)] flex justify-between items-center">
               <div>
                  <h3 className="font-black text-xl text-[var(--heading)] flex items-center gap-2"><UserCog size={24} className="text-[var(--accent)]"/> {userProfileModal.isNew ? 'Nuevo Usuario' : 'Editar Perfil'}</h3>
                  <p className="text-xs text-[var(--muted)] mt-1 font-mono">{userProfileModal.isNew ? 'Nueva cuenta de acceso' : userProfileModal.email}</p>
               </div>
               <Button variant="ghost" onClick={() => setUserProfileModal(null)} className="hover:bg-[var(--surface-hover)]"><XCircle size={24} /></Button>
            </div>
            
            <div className="p-8 flex flex-col md:flex-row gap-8 bg-[var(--surface-hover)]">
               {/* Izquierda: Foto y Estado */}
               <div className="flex flex-col items-center space-y-4 w-full md:w-1/3">
                  <div className="relative group cursor-pointer">
                     <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-xl bg-slate-200">
                        {profilePreview ? (
                           <img src={profilePreview} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                           <div className="w-full h-full flex flex-col items-center justify-center text-[var(--muted)] bg-[var(--surface-hover)]">
                              <ImageIcon size={40} className="mb-2 opacity-50"/>
                              <span className="text-[10px] font-black uppercase">Sin Foto</span>
                           </div>
                        )}
                     </div>
                     <label className="absolute inset-0 bg-[var(--heading)]/50 rounded-full flex flex-col items-center justify-center text-[var(--surface)] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <Camera size={24} className="mb-1"/>
                        <span className="text-[10px] font-black uppercase tracking-widest">Cambiar</span>
                        <input 
                           type="file" 
                           className="hidden" 
                           accept="image/*"
                           onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                 setProfileFile(file);
                                 setProfilePreview(URL.createObjectURL(file));
                              }
                           }}
                        />
                     </label>
                  </div>
                  
                  <div className="w-full pt-4 border-t border-slate-200 text-center">
                     <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Estado de Acceso</label>
                     <div className="flex items-center justify-center gap-2">
                        <span className={`text-xs font-bold ${!profileData.is_active ? 'text-rose-500' : 'text-slate-400'}`}>Inactivo</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                           <input 
                              type="checkbox" 
                              className="sr-only peer" 
                              checked={profileData.is_active}
                              onChange={(e) => setProfileData({...profileData, is_active: e.target.checked})}
                           />
                           <div className="w-11 h-6 bg-[var(--danger)] rounded-full peer peer-focus:ring-4 peer-focus:ring-[var(--success)]/30 peer-checked:bg-[var(--success)] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--surface)] after:border-[var(--border)] after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-[var(--surface)]"></div>
                        </label>
                        <span className={`text-xs font-bold ${profileData.is_active ? 'text-emerald-500' : 'text-slate-400'}`}>Activo</span>
                     </div>
                  </div>
               </div>

               {/* Derecha: Datos y Seguridad */}
               <div className="flex-1 space-y-6">
                  {userProfileModal.isNew && (
                    <div>
                      <label className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-[var(--heading)]">
                        <Users size={12} /> Empleado RRHH (Opcional)
                      </label>
                      <select
                        value={profileData.employee_id || ''}
                        onChange={(e) => {
                          const id = e.target.value;
                          const opt = e.target.selectedOptions?.[0];
                          applyEmployeeToProfile(id, {
                            name: opt?.getAttribute('data-name') || '',
                            email: opt?.getAttribute('data-email') || '',
                            label: opt?.textContent || '',
                          });
                        }}
                        className="h-10 w-full rounded-lg border-2 border-emerald-100 bg-emerald-50 px-3 text-sm font-bold text-emerald-900 outline-none transition-all focus:border-emerald-400"
                      >
                        <option value="">-- Selecciona el empleado --</option>
                        {hrEmployeesWithoutAccount.map((e) => (
                          <option
                            key={e.id}
                            value={e.id}
                            data-name={String(e.nombre_completo || '').trim()}
                            data-email={String(e.email || '').trim()}
                          >
                            {e.codigo_empleado} - {e.nombre_completo || 'Sin nombre'}
                            {e.email ? ` (${e.email})` : ''}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[10px] font-medium text-[var(--muted)]">
                        Opcional. Solo aparecen empleados sin cuenta. Si eliges uno, se autocompletan nombre y correo; si no, escríbelos a mano.
                      </p>
                    </div>
                  )}

                  <div>
                     <label className="text-[10px] font-black text-[var(--heading)] uppercase tracking-widest block mb-1">Nombre Completo</label>
                     <input 
                        type="text" 
                        value={profileData.full_name}
                        onChange={e => setProfileData({...profileData, full_name: e.target.value})}
                        readOnly={Boolean(userProfileModal.isNew && profileData.employee_id)}
                        className={`w-full h-10 px-3 border-2 border-[var(--border)] rounded-lg text-sm font-bold outline-none transition-all ${
                          userProfileModal.isNew && profileData.employee_id
                            ? 'bg-[var(--surface-hover)] text-[var(--heading)] cursor-default'
                            : 'bg-[var(--surface)] focus:border-[var(--accent)]'
                        }`}
                        placeholder="Se completa al elegir empleado"
                     />
                  </div>
                  <div>
                     <label className="text-[10px] font-black text-[var(--heading)] uppercase tracking-widest block mb-1">
                       Correo Electrónico {userProfileModal.isNew ? '(Obligatorio)' : '(No editable)'}
                     </label>
                     <input 
                        type="email" 
                        value={profileData.email}
                        onChange={e => setProfileData({...profileData, email: e.target.value})}
                        disabled={!userProfileModal.isNew}
                        className={`w-full h-10 px-3 border-2 border-[var(--border)] rounded-lg text-sm font-bold outline-none transition-all ${
                          !userProfileModal.isNew
                            ? 'bg-[var(--surface-hover)] text-[var(--muted)] cursor-not-allowed'
                            : 'bg-[var(--surface)] focus:border-[var(--accent)] text-[var(--heading)]'
                        }`}
                        placeholder="se genera al elegir empleado"
                     />
                     {userProfileModal.isNew && profileData.employee_id && profileData.email && (
                       <p className="mt-1 text-[10px] font-medium text-[var(--muted)]">
                         Correo de ingreso (del expediente o generado). Puedes editarlo antes de guardar.
                       </p>
                     )}
                  </div>
                  <div>
                     <label className="text-[10px] font-black text-[var(--heading)] uppercase tracking-widest block mb-1">Rol en el Sistema</label>
                     <select 
                        value={profileData.role_id}
                        onChange={e => setProfileData({...profileData, role_id: e.target.value})}
                        className="w-full h-10 px-3 bg-[var(--surface)] border-2 border-[var(--border)] rounded-lg text-sm font-bold outline-none focus:border-[var(--accent)] transition-all"
                     >
                        <option value="" disabled>Selecciona un rol...</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                     </select>
                  </div>

                  {!userProfileModal.isNew && (
                  <div>
                     <label className="text-[10px] font-black text-[var(--heading)] uppercase tracking-widest block mb-1 flex items-center gap-1"><Users size={12}/> Enlazar a Empleado (RRHH)</label>
                     <select 
                        value={profileData.employee_id || ''}
                        onChange={(e) => {
                          const id = e.target.value;
                          const opt = e.target.selectedOptions?.[0];
                          applyEmployeeToProfile(id, {
                            name: opt?.getAttribute('data-name') || '',
                            email: opt?.getAttribute('data-email') || '',
                            label: opt?.textContent || '',
                          });
                        }}
                        className="w-full h-10 px-3 bg-emerald-50 border-2 border-emerald-100 rounded-lg text-sm font-bold text-emerald-900 outline-none focus:border-emerald-400 transition-all"
                     >
                        <option value="">-- Sin cuenta de empleado --</option>
                        {hrEmployeesAvailableToLink.map(e => (
                          <option
                            key={e.id}
                            value={e.id}
                            data-name={String(e.nombre_completo || '').trim()}
                            data-email={String(e.email || '').trim()}
                          >
                            {e.codigo_empleado} - {e.nombre_completo || 'Sin nombre'}
                            {e.email ? ` (${e.email})` : ''}
                          </option>
                        ))}
                     </select>
                     <p className="mt-1 text-[10px] font-medium text-[var(--muted)]">
                       No se listan empleados que ya tienen otra cuenta enlazada.
                     </p>
                  </div>
                  )}
                  
                  {userProfileModal.isNew && (
                    <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
                      <label className="mb-1 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-sky-800">
                        <KeyRound size={12} /> Modo de alta
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 text-xs font-medium text-sky-900">
                        <input
                          type="radio"
                          name="createMode"
                          className="mt-0.5"
                          checked={createMode === 'invite'}
                          onChange={() => setCreateMode('invite')}
                        />
                        <span>
                          <span className="font-bold">Enviar invitación por correo</span>
                          <span className="mt-0.5 block text-[10px] font-medium text-sky-700">
                            El usuario crea su contraseña (recomendado).
                          </span>
                        </span>
                      </label>
                      <label className="flex cursor-pointer items-start gap-2 text-xs font-medium text-sky-900">
                        <input
                          type="radio"
                          name="createMode"
                          className="mt-0.5"
                          checked={createMode === 'manual'}
                          onChange={() => setCreateMode('manual')}
                        />
                        <span>
                          <span className="font-bold">Asignar contraseña manualmente</span>
                          <span className="mt-0.5 block text-[10px] font-medium text-sky-700">
                            Comportamiento anterior: defines la clave ahora.
                          </span>
                        </span>
                      </label>
                    </div>
                  )}

                  {(createMode === 'manual' || !userProfileModal.isNew) && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                     <label className="text-[10px] font-black text-amber-700 uppercase tracking-widest block mb-1 flex items-center gap-1"><KeyRound size={12}/> {userProfileModal.isNew ? 'Contraseña (Obligatoria)' : 'Forzar Cambio de Contraseña'}</label>
                     <p className="text-[10px] text-amber-600 mb-2 leading-tight">{userProfileModal.isNew ? 'Define rol y contraseña. Si el correo ya existe en Auth, se enlaza la cuenta y se reemplaza la clave.' : 'Si escribes aquí, la contraseña del usuario será reemplazada. Déjalo en blanco para no cambiarla.'}</p>
                     <input 
                        type="password" 
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres..."
                        className="w-full h-9 px-3 bg-[var(--surface)] border border-[var(--warning)]/30 rounded-md text-sm outline-none focus:border-[var(--warning)] transition-all"
                     />
                     {!userProfileModal.isNew && (
                       <Button
                         type="button"
                         variant="outline"
                         disabled={actionLoading || !canEditSeguridad}
                         className="mt-3 h-9 w-full border-amber-300 text-amber-800 hover:bg-amber-100"
                         onClick={async () => {
                           const targetEmail =
                             profileData.email || userProfileModal.email || '';
                           if (!targetEmail) {
                             notify.warning('Sin correo', {
                               description: 'Este usuario no tiene correo para restablecer.',
                             });
                             return;
                           }
                           setActionLoading(true);
                           const res = await adminSendPasswordResetEmail(
                             targetEmail,
                             typeof window !== 'undefined' ? window.location.origin : undefined
                           );
                           setActionLoading(false);
                           if (res.error) {
                             notify.error('No se pudo enviar el enlace', {
                               description: res.error,
                             });
                             return;
                           }
                           const emailSent =
                             'emailSent' in res && res.emailSent === true;
                           if (
                             !emailSent &&
                             'actionLink' in res &&
                             typeof res.actionLink === 'string' &&
                             res.actionLink
                           ) {
                             try {
                               await navigator.clipboard.writeText(res.actionLink);
                               notify.success('Enlace copiado', {
                                 description:
                                   res.message ||
                                   'El enlace quedó en el portapapeles. Envíalo al usuario (WhatsApp/correo).',
                               });
                             } catch {
                               notify.success('Enlace listo', {
                                 description: res.actionLink,
                               });
                             }
                             return;
                           }
                           notify.success('Enlace enviado', {
                             description:
                               res.message ||
                               'Se envió un correo de restablecimiento al usuario.',
                           });
                         }}
                       >
                         Enviar enlace de restablecimiento al correo
                       </Button>
                     )}
                  </div>
                  )}
               </div>
            </div>

            <div className="p-4 border-t border-[var(--border)] bg-[var(--surface)] flex justify-end gap-3">
               <Button variant="ghost" onClick={() => setUserProfileModal(null)}>Cancelar</Button>
               <Button 
                  onClick={handleSaveProfile} 
                  disabled={actionLoading || !canEditSeguridad}
                  className="bg-[var(--heading)] hover:opacity-90 text-[var(--surface)] shadow-lg"
               >
                  {actionLoading ? 'Guardando...' : 'Guardar Cambios'}
               </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal Diff */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--heading)]/50 backdrop-blur-sm animate-fade-in p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-hover)] flex justify-between items-center">
              <div>
                <h3 className="font-black text-[var(--heading)]">Detalle de Auditoría</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-[var(--surface-hover)] text-[var(--muted)] border-none font-mono text-[10px]">
                    ID: {selectedLog.id?.substring(0,8)}
                  </Badge>
                  <span className="text-[10px] text-slate-400 font-mono hidden md:inline-block truncate" title={selectedLog.id}>{selectedLog.id}</span>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setSelectedLog(null)} className="h-8 px-2 text-slate-400">
                Cerrar
              </Button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 bg-[var(--surface-hover)]/50">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase text-[var(--muted)]">Fecha y Hora</p>
                  <p className="text-sm font-bold text-[var(--heading)]">{new Date(selectedLog.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-[var(--muted)]">Usuario</p>
                  <p className="text-sm font-bold text-[var(--heading)]">{selectedLog.profiles?.full_name || 'Sistema'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-[var(--muted)]">Dirección IP</p>
                  <p className="text-sm font-mono text-[var(--foreground)]">{selectedLog.ip_address || 'No Registrada'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-[var(--muted)]">Tipo de Acción</p>
                  <p className="text-sm font-bold text-[var(--accent)]">{selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-[var(--muted)]">Tabla / Módulo</p>
                  <p className="text-sm font-mono text-[var(--foreground)]">{selectedLog.module} <br/> <span className="text-[10px] text-[var(--muted)]">{selectedLog.table_name}</span></p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card padding="none" className="overflow-hidden border border-[var(--danger)]/20">
                  <div className="bg-[var(--danger)]/15 p-2 border-b border-[var(--danger)]/20 text-xs font-black uppercase text-[var(--danger)] tracking-widest text-center">Valores Anteriores</div>
                  <div className="p-4 bg-[var(--surface)] min-h-[150px] overflow-x-auto">
                     {(() => {
                       const entries = formatAuditDiffEntries(
                         selectedLog.old_values as Record<string, unknown> | null
                       );
                       if (entries.length === 0) {
                         return (
                           <p className="text-slate-400 italic text-center mt-10 text-xs">
                             Sin valores anteriores (evento de creación o sin snapshot previo)
                           </p>
                         );
                       }
                       return (
                         <ul className="space-y-3">
                           {entries.map((e) => (
                             <li key={e.key} className="flex flex-col border-b border-slate-50 pb-2">
                               <span className="text-[10px] font-black text-rose-400 uppercase tracking-wide">
                                 {e.label}
                               </span>
                               <span className="text-sm text-slate-700 break-words whitespace-pre-wrap">
                                 {e.value}
                               </span>
                             </li>
                           ))}
                         </ul>
                       );
                     })()}
                  </div>
                </Card>
                <Card padding="none" className="overflow-hidden border border-[var(--success)]/20">
                  <div className="bg-[var(--success)]/15 p-2 border-b border-[var(--success)]/20 text-xs font-black uppercase text-[var(--success)] tracking-widest text-center">Valores Nuevos</div>
                  <div className="p-4 bg-[var(--surface)] min-h-[150px] overflow-x-auto">
                     {(() => {
                       const entries = formatAuditDiffEntries(
                         selectedLog.new_values as Record<string, unknown> | null
                       );
                       if (entries.length === 0) {
                         return (
                           <p className="text-slate-400 italic text-center mt-10 text-xs">
                             Sin valores nuevos registrados
                           </p>
                         );
                       }
                       return (
                         <ul className="space-y-3">
                           {entries.map((e) => (
                             <li key={e.key} className="flex flex-col border-b border-slate-50 pb-2">
                               <span className="text-[10px] font-black text-emerald-500 uppercase tracking-wide">
                                 {e.label}
                               </span>
                               <span className="text-sm text-slate-700 break-words whitespace-pre-wrap">
                                 {e.value}
                               </span>
                             </li>
                           ))}
                         </ul>
                       );
                     })()}
                  </div>
                </Card>
              </div>

              {selectedLog.observations && (
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Observaciones</p>
                  <Card className="p-3 bg-[var(--surface)] text-sm text-[var(--foreground)] font-mono">{selectedLog.observations}</Card>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

    </ModulePage>
  );
}
