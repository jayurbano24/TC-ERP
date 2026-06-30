"use client";

import React, { useState, useEffect } from 'react';
import { Card, Badge, Button, notify } from '@/components/ui';
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
  KeyRound
} from 'lucide-react';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
// DB Access
import { getProfiles, assignUserRole, saveProfile } from '@/shared/catalogs/catalogs';
import { getAdvancedAuditLogs, logAdvancedAudit } from '@/modules/platform/client/audit';
import { getRoles, getRolePermissions, updateRolePermission, getUsersWithRoles, getUserSecurity, updateUserSecurity, changeUserRole } from '@/modules/platform/client/roles';
import { adminUpdateUserPassword, adminToggleUserStatus, adminCreateUser } from '@/lib/actions/users';
import { uploadAvatar } from '@/modules/platform/client/storage';
import { useCan } from '@/components/authz';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { Camera, Image as ImageIcon } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function SeguridadPage() {
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'audit'>('roles');
  
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
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const MODULES_MATRIX = [
    'Dashboard',
    'Consulta',
    'Recepción General', 
    'Devoluciones', 
    'Backoffice', 
    'Taller', 
    'Bodega',
    'Accesorios',
    'Despacho',
    'Integración SAP',
    'Reportes',
    'Recursos Humanos',
    'Productividad', 
    'Costos', 
    'Seguridad',
    'Configuración del Sistema'
  ];

  useEffect(() => {
    if (activeTab === 'roles' || activeTab === 'users') {
      loadRBACData();
    } else {
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
        const { data: emps } = await supabase.from('employees').select('id, codigo_empleado, nombre_completo').order('nombre_completo');
        if (emps) setHrEmployees(emps);
      }
      
      const rolesData = await getRoles();
      if (!rolesData || rolesData.length === 0) {
        setDbError("No se encontraron roles. O la base de datos está vacía, o el script SQL falló.");
      } else {
        setDbError(null);
      }
      setRoles(rolesData);
      if (rolesData.length > 0 && !selectedRole) setSelectedRole(rolesData[0]);
      
      const usersData = await getUsersWithRoles();
      setUsers(usersData);
    } catch (e: any) {
      setDbError(e.message || "Error fatal de Base de Datos");
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
  };

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
      // Create new user
      if (!profileData.email || !newPassword || !profileData.full_name) {
        notify.warning('Datos incompletos', { description: 'Correo, Contraseña y Nombre son obligatorios para nuevos usuarios.' });
        setActionLoading(false);
        return;
      }
      const res = await adminCreateUser(
        profileData.email, 
        newPassword, 
        profileData.full_name, 
        profileData.role_id, 
        profileData.employee_id
      );
      if (res.error) {
        notify.error('Error creando usuario', { description: res.error });
        setActionLoading(false);
        return;
      }
      
      // If we uploaded a file for a new user, we'd need to upload it AFTER user creation
      if (profileFile && res.user) {
        const uploadRes = await uploadAvatar(res.user.id, profileFile);
        if (!uploadRes.error) {
          await saveProfile({ id: res.user.id, avatar_url: uploadRes.url });
        }
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
           }
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
      case 'CRITICAL': return <Badge className="bg-rose-100 text-rose-700 border-rose-200 font-black"><ShieldAlert size={12} className="mr-1"/> CRITICAL</Badge>;
      case 'WARNING': return <Badge className="bg-amber-100 text-amber-700 border-amber-200 font-black"><AlertTriangle size={12} className="mr-1"/> WARNING</Badge>;
      default: return <Badge className="bg-blue-50 text-blue-600 border-blue-100 font-black"><Info size={12} className="mr-1"/> INFO</Badge>;
    }
  };

  // Filtrado de Usuarios para la pestaña "users"
  const filteredUsers = users.filter(u => {
    if (!userSearch) return true;
    const term = userSearch.toLowerCase();
    return u.full_name?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term) || u.role?.toLowerCase().includes(term);
  });

  // Usuarios del rol actual para la pestaña "roles"
  const roleUsers = users.filter(u => u.role_id === selectedRole?.id || u.role === selectedRole?.name);

  return (
    <ModulePage
      title="Seguridad Corporativa"
      category="Enterprise Management"
    >
      <div className="flex items-center gap-4 mb-6 border-b border-slate-100">
        <button 
          onClick={() => setActiveTab('users')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'users' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          <div className="flex items-center gap-2">
            <UserCog className="w-4 h-4" />
            Gestión de Usuarios
          </div>
          {activeTab === 'users' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#2ec4f1] rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('roles')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'roles' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Roles y Permisos
          </div>
          {activeTab === 'roles' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#2ec4f1] rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('audit')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'audit' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4" />
            Auditoría Avanzada
          </div>
          {activeTab === 'audit' && <div className="absolute bottom-0 left-0 w-full h-1 bg-[#2ec4f1] rounded-t-full" />}
        </button>
      </div>

      {dbError && (
        <div className="mb-6 bg-rose-50 border-2 border-rose-200 text-rose-700 p-4 rounded-xl flex items-center gap-3 animate-pulse">
          <AlertTriangle size={24} />
          <div>
            <h4 className="font-bold">Error de Base de Datos Detectado</h4>
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

      {/* PESTAÑA 1: USUARIOS */}
      {activeTab === 'users' && (
        <div className="space-y-6 animate-rise-in">
          <Card padding="none" className="overflow-hidden shadow-xl shadow-slate-200/50 border-2 border-slate-100 flex flex-col min-h-[600px]">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4">
              <div>
                <h3 className="font-black text-[#181c3a] text-sm uppercase tracking-widest flex items-center gap-2">
                  <UserCog size={18} className="text-[#2ec4f1]" />
                  Directorio de Cuentas
                </h3>
                <p className="text-xs text-slate-500 mt-1">Administra accesos, contraseñas y roles del personal.</p>
              </div>
              <div className="flex gap-4 items-center">
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Buscar por nombre, correo o rol..." 
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    className="w-full h-10 pl-10 pr-4 bg-white border-2 border-slate-100 rounded-lg text-xs font-bold outline-none focus:border-[#2ec4f1] transition-all"
                  />
                </div>
                <Button variant="primary" className="gap-2 shrink-0" onClick={handleOpenCreateProfile} disabled={!canEditSeguridad}>
                  <Plus className="w-4 h-4" /> Nuevo Usuario
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-200 text-[#181c3a] text-[10px] font-black uppercase tracking-widest sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-4 rounded-tl-xl">Empleado</th>
                    <th className="px-6 py-4">Correo</th>
                    <th className="px-6 py-4 text-center">Rol Asignado</th>
                    <th className="px-6 py-4 text-center">Estatus</th>
                    <th className="px-6 py-4 text-center rounded-tr-xl">Acciones de Seguridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredUsers.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-100 flex-shrink-0">
                            {user.avatar_url ? (
                              <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-[#181c3a] text-white text-xs font-black uppercase">
                                {user.full_name ? user.full_name.substring(0, 2) : 'US'}
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-[#181c3a]">{user.full_name || 'Sin Nombre'}</div>
                            {user.employee_code && (
                              <div className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded inline-block mt-0.5">
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
                        <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {user.status === 'Activo' ? (
                          <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200"><CheckCircle2 size={12} className="mr-1"/> Activo</Badge>
                        ) : (
                          <Badge className="bg-rose-50 text-rose-600 border-rose-200"><Ban size={12} className="mr-1"/> Suspendido</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleOpenProfile(user)}
                          className="h-8 border-slate-200 text-[#181c3a] hover:bg-[#181c3a] hover:text-white hover:border-[#181c3a]"
                        >
                          <Edit2 size={14} className="mr-2" /> Editar Perfil
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filteredUsers.length === 0 && (
                     <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-slate-400 font-medium">No se encontraron usuarios</td>
                     </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* PESTAÑA 2: ROLES */}
      {activeTab === 'roles' && (
        <div className="flex flex-col lg:flex-row gap-6 animate-rise-in h-auto min-h-[700px]">
          
          {/* COLUMNA 1: LISTA DE ROLES */}
          <Card className="w-full lg:w-64 shrink-0 flex flex-col p-4 shadow-xl shadow-slate-200/50 border-2 border-slate-100">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-black text-[#181c3a] tracking-tight">ROLES</h3>
              <Button size="sm" variant="outline" className="h-8 w-8 p-0 border-slate-200 text-[#2ec4f1]"><Plus size={16} /></Button>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar rol..." 
                value={roleSearch}
                onChange={e => setRoleSearch(e.target.value)}
                className="w-full h-9 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-[#2ec4f1]"
              />
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {roles.filter(r => r.name.toLowerCase().includes(roleSearch.toLowerCase())).map(role => (
                <div 
                  key={role.id}
                  onClick={() => setSelectedRole(role)}
                  className={`p-3 rounded-xl cursor-pointer border-2 transition-all ${selectedRole?.id === role.id ? 'bg-[#181c3a] border-[#181c3a] text-white shadow-md' : 'bg-white border-transparent hover:border-slate-100 text-slate-600'}`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-sm">{role.name}</span>
                    {role.is_system && <ShieldCheck size={14} className={selectedRole?.id === role.id ? "text-[#2ec4f1]" : "text-amber-500"} />}
                  </div>
                  <span className={`text-[10px] truncate block mt-1 ${selectedRole?.id === role.id ? 'text-slate-400' : 'text-slate-400'}`}>
                    {role.description || 'Sin descripción'}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* COLUMNA 2: MATRIZ DE PERMISOS */}
          <Card padding="none" className="flex-1 flex flex-col shadow-xl shadow-slate-200/50 border-2 border-slate-100 overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-black text-[#181c3a] flex items-center gap-2">
                  <Shield size={20} className="text-[#2ec4f1]" />
                  Matriz de Permisos: {selectedRole?.name}
                </h2>
                <p className="text-xs text-slate-500 mt-1">Habilita o deshabilita accesos a nivel de módulo.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="h-8 border-slate-200 text-slate-600" disabled={!canEditSeguridad}><Copy size={14} className="mr-2" /> Copiar Permisos</Button>
              </div>
            </div>
            
            <div className="overflow-x-auto p-0 flex-1">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-slate-200 text-[#181c3a] text-[10px] font-black uppercase tracking-widest sticky top-0 z-10">
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
                  {MODULES_MATRIX.map(module => {
                    const perm = permissions.find(p => p.module_name === module) || {};
                    return (
                      <tr key={module} className="hover:bg-slate-50/50 transition-colors">
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
                                <div className={`w-9 h-5 rounded-full peer peer-focus:ring-4 peer-focus:ring-[#2ec4f1]/20 transition-all ${isChecked ? 'bg-[#10b981]' : 'bg-slate-200'} ${isLoading ? 'opacity-50' : ''}`}></div>
                                <div className={`absolute left-[2px] top-[2px] bg-white border border-slate-300 w-4 h-4 rounded-full transition-all ${isChecked ? 'translate-x-full border-white' : ''}`}></div>
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
              <div className="p-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <h3 className="font-black text-[#181c3a] text-sm uppercase tracking-widest flex items-center gap-2">
                  <Users size={16} className="text-[#2ec4f1]" />
                  Usuarios ({roleUsers.length})
                </h3>
              </div>
              <div className="p-4 overflow-y-auto space-y-3 flex-1 min-h-[300px]">
                {roleUsers.length > 0 ? roleUsers.map(user => (
                  <div key={user.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl bg-white hover:border-[#2ec4f1] transition-colors group">
                    <div>
                      <p className="text-xs font-bold text-[#181c3a]">{user.full_name || 'Usuario'}</p>
                      <p className="text-[10px] text-slate-400">{user.email}</p>
                    </div>
                    {user.status === 'Activo' ? (
                        <Badge className="bg-emerald-50 text-emerald-600 border-none scale-75 origin-right">Activo</Badge>
                    ) : (
                        <Badge className="bg-rose-50 text-rose-600 border-none scale-75 origin-right">Inactivo</Badge>
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

            <Card className="flex flex-col p-5 shadow-xl shadow-slate-200/50 border-2 border-slate-100 bg-[#181c3a] text-white">
              <h3 className="font-black text-white text-sm uppercase tracking-widest flex items-center gap-2 mb-4">
                <Lock size={16} className="text-amber-400" />
                Políticas
              </h3>
              <p className="text-[10px] text-slate-400 mb-4 leading-relaxed">Configuraciones de autenticación para miembros de este rol.</p>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-200">Requerir 2FA</span>
                  <div className="w-8 h-4 bg-slate-600 rounded-full relative cursor-not-allowed opacity-50">
                    <div className="absolute left-1 top-0.5 w-3 h-3 bg-slate-400 rounded-full"></div>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-200">Forzar cambio</span>
                  <div className="w-8 h-4 bg-slate-600 rounded-full relative cursor-not-allowed opacity-50">
                    <div className="absolute left-1 top-0.5 w-3 h-3 bg-slate-400 rounded-full"></div>
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
            <Card className="p-4 border-l-4 border-l-[#181c3a] flex flex-col justify-center">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Eventos</p>
              <h2 className="text-2xl font-bold text-[#181c3a]">{totalLogs}</h2>
            </Card>
            <Card className="p-4 border-l-4 border-l-rose-500 flex flex-col justify-center">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Críticos Recientes</p>
              <h2 className="text-2xl font-bold text-rose-600">{logs.filter(l => l.severity === 'CRITICAL').length}</h2>
            </Card>
            <Card className="p-4 border-l-4 border-l-amber-500 flex flex-col justify-center">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Advertencias</p>
              <h2 className="text-2xl font-bold text-amber-600">{logs.filter(l => l.severity === 'WARNING').length}</h2>
            </Card>
            <Card className="p-4 border-l-4 border-l-blue-500 flex flex-col justify-center">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Exportar Datos</p>
              <Button onClick={exportToExcel} variant="outline" className="mt-2 w-full h-8 text-xs font-bold border-slate-200">
                <Download size={14} className="mr-2" />
                Excel (XLSX)
              </Button>
            </Card>
          </div>

          <Card padding="none" className="overflow-hidden border-2 border-slate-100 shadow-xl shadow-slate-200/50">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">
              <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-widest flex items-center gap-2">
                <Filter size={18} className="text-[#2ec4f1]" />
                Filtros de Auditoría
              </h3>
              
              <div className="flex flex-wrap gap-2">
                <select 
                  value={filterSeverity} 
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="h-9 px-3 bg-white border-2 border-slate-100 rounded-lg text-xs font-bold text-[#181c3a] outline-none"
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
                    className="w-full h-9 pl-10 pr-4 bg-white border-2 border-slate-100 rounded-lg text-xs font-bold text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-all"
                  />
                </div>
              </div>
            </div>
            
            {auditLoading ? (
              <div className="p-10 text-center text-slate-400 font-bold animate-pulse">Consultando el motor de auditoría...</div>
            ) : (
              <div className="overflow-x-auto min-h-[400px]">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-200 text-[#181c3a] text-[10px] font-black uppercase tracking-widest">
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
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 text-slate-500 font-mono">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-6 py-3">
                          {getSeverityBadge(log.severity)}
                        </td>
                        <td className="px-6 py-3 font-bold text-[#181c3a]">
                          {log.profiles?.full_name || 'SISTEMA'}
                          <span className="block text-[9px] text-slate-400">{log.user_role}</span>
                        </td>
                        <td className="px-6 py-3 font-bold text-slate-600">
                          {log.module}
                        </td>
                        <td className="px-6 py-3">
                          <Badge className="bg-slate-100 text-slate-600 border-none font-bold">
                            {log.action}
                          </Badge>
                        </td>
                        <td className="px-6 py-3 font-mono text-slate-600">
                          {log.table_name}
                        </td>
                        <td className="px-6 py-3">
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-md font-mono text-[10px] text-slate-500" title={log.record_id}>
                            <span className="text-slate-400">#</span>
                            {log.record_id ? (log.record_id.length > 8 ? log.record_id.substring(0, 8) : log.record_id) : 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-center">
                          <button 
                            onClick={() => setSelectedLog(log)}
                            className="p-1.5 bg-slate-100 text-[#2ec4f1] hover:bg-[#2ec4f1] hover:text-white rounded-md transition-colors"
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
            
            <div className="p-4 border-t border-slate-100 bg-white flex justify-between items-center">
              <span className="text-xs font-bold text-slate-400">
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
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#181c3a]/70 backdrop-blur-sm animate-fade-in p-4">
          <Card className="w-full max-w-2xl flex flex-col overflow-hidden shadow-2xl p-0">
            <div className="p-6 bg-[#181c3a] text-white flex justify-between items-center">
               <div>
                  <h3 className="font-black text-xl flex items-center gap-2"><UserCog size={24} className="text-[#2ec4f1]"/> {userProfileModal.isNew ? 'Nuevo Usuario' : 'Editar Perfil'}</h3>
                  <p className="text-xs text-slate-400 mt-1 font-mono">{userProfileModal.isNew ? 'Nueva cuenta de acceso' : userProfileModal.email}</p>
               </div>
               <Button variant="ghost" onClick={() => setUserProfileModal(null)} className="hover:bg-white/10"><XCircle size={24} /></Button>
            </div>
            
            <div className="p-8 flex flex-col md:flex-row gap-8 bg-slate-50">
               {/* Izquierda: Foto y Estado */}
               <div className="flex flex-col items-center space-y-4 w-full md:w-1/3">
                  <div className="relative group cursor-pointer">
                     <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-xl bg-slate-200">
                        {profilePreview ? (
                           <img src={profilePreview} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                           <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-100">
                              <ImageIcon size={40} className="mb-2 opacity-50"/>
                              <span className="text-[10px] font-black uppercase">Sin Foto</span>
                           </div>
                        )}
                     </div>
                     <label className="absolute inset-0 bg-[#181c3a]/50 rounded-full flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
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
                           <div className="w-11 h-6 bg-rose-500 rounded-full peer peer-focus:ring-4 peer-focus:ring-emerald-300 peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full peer-checked:after:border-white"></div>
                        </label>
                        <span className={`text-xs font-bold ${profileData.is_active ? 'text-emerald-500' : 'text-slate-400'}`}>Activo</span>
                     </div>
                  </div>
               </div>

               {/* Derecha: Datos y Seguridad */}
               <div className="flex-1 space-y-6">
                  <div>
                     <label className="text-[10px] font-black text-[#181c3a] uppercase tracking-widest block mb-1">Nombre Completo</label>
                     <input 
                        type="text" 
                        value={profileData.full_name}
                        onChange={e => setProfileData({...profileData, full_name: e.target.value})}
                        className="w-full h-10 px-3 bg-white border-2 border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all"
                     />
                  </div>
                  <div>
                     <label className="text-[10px] font-black text-[#181c3a] uppercase tracking-widest block mb-1">
                       Correo Electrónico {userProfileModal.isNew ? '(Obligatorio)' : '(No editable)'}
                     </label>
                     <input 
                        type="email" 
                        value={profileData.email}
                        onChange={e => setProfileData({...profileData, email: e.target.value})}
                        disabled={!userProfileModal.isNew}
                        className={`w-full h-10 px-3 border-2 border-slate-200 rounded-lg text-sm font-bold outline-none transition-all ${userProfileModal.isNew ? 'bg-white focus:border-[#2ec4f1] text-[#181c3a]' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                     />
                  </div>
                  <div>
                     <label className="text-[10px] font-black text-[#181c3a] uppercase tracking-widest block mb-1">Rol en el Sistema</label>
                     <select 
                        value={profileData.role_id}
                        onChange={e => setProfileData({...profileData, role_id: e.target.value})}
                        className="w-full h-10 px-3 bg-white border-2 border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all"
                     >
                        <option value="" disabled>Selecciona un rol...</option>
                        {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                     </select>
                  </div>

                  <div>
                     <label className="text-[10px] font-black text-[#181c3a] uppercase tracking-widest block mb-1 flex items-center gap-1"><Users size={12}/> Enlazar a Empleado (RRHH)</label>
                     <select 
                        value={profileData.employee_id || ''}
                        onChange={e => setProfileData({...profileData, employee_id: e.target.value})}
                        className="w-full h-10 px-3 bg-emerald-50 border-2 border-emerald-100 rounded-lg text-sm font-bold text-emerald-900 outline-none focus:border-emerald-400 transition-all"
                     >
                        <option value="">-- Sin cuenta de empleado --</option>
                        {hrEmployees.map(e => <option key={e.id} value={e.id}>{e.codigo_empleado} - {e.nombre_completo}</option>)}
                     </select>
                  </div>
                  
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                     <label className="text-[10px] font-black text-amber-700 uppercase tracking-widest block mb-1 flex items-center gap-1"><KeyRound size={12}/> {userProfileModal.isNew ? 'Contraseña (Obligatoria)' : 'Forzar Cambio de Contraseña'}</label>
                     <p className="text-[10px] text-amber-600 mb-2 leading-tight">{userProfileModal.isNew ? 'Escribe la contraseña inicial para este usuario.' : 'Si escribes aquí, la contraseña del usuario será reemplazada. Déjalo en blanco para no cambiarla.'}</p>
                     <input 
                        type="password" 
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres..."
                        className="w-full h-9 px-3 bg-white border border-amber-200 rounded-md text-sm outline-none focus:border-amber-500 transition-all"
                     />
                  </div>
               </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3">
               <Button variant="ghost" onClick={() => setUserProfileModal(null)}>Cancelar</Button>
               <Button 
                  onClick={handleSaveProfile} 
                  disabled={actionLoading || !canEditSeguridad}
                  className="bg-[#181c3a] hover:bg-slate-800 text-white shadow-lg"
               >
                  {actionLoading ? 'Guardando...' : 'Guardar Cambios'}
               </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Modal Diff */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/50 backdrop-blur-sm animate-fade-in p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <div>
                <h3 className="font-black text-[#181c3a]">Detalle de Auditoría</h3>
                <div className="flex items-center gap-2 mt-1">
                  <Badge className="bg-slate-100 text-slate-500 border-none font-mono text-[10px]">
                    ID: {selectedLog.id?.substring(0,8)}
                  </Badge>
                  <span className="text-[10px] text-slate-400 font-mono hidden md:inline-block truncate" title={selectedLog.id}>{selectedLog.id}</span>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setSelectedLog(null)} className="h-8 px-2 text-slate-400">
                Cerrar
              </Button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 bg-slate-50/50">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Fecha y Hora</p>
                  <p className="text-sm font-bold text-[#181c3a]">{new Date(selectedLog.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Usuario</p>
                  <p className="text-sm font-bold text-[#181c3a]">{selectedLog.profiles?.full_name || 'Sistema'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Dirección IP</p>
                  <p className="text-sm font-mono text-slate-600">{selectedLog.ip_address || 'No Registrada'}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Tipo de Acción</p>
                  <p className="text-sm font-bold text-[#2ec4f1]">{selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400">Tabla / Módulo</p>
                  <p className="text-sm font-mono text-slate-600">{selectedLog.module} <br/> <span className="text-[10px] text-slate-400">{selectedLog.table_name}</span></p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card padding="none" className="overflow-hidden border border-rose-100">
                  <div className="bg-rose-50 p-2 border-b border-rose-100 text-xs font-black uppercase text-rose-600 tracking-widest text-center">Valores Anteriores</div>
                  <div className="p-4 bg-white min-h-[150px] overflow-x-auto">
                     {(!selectedLog.old_values || Object.keys(selectedLog.old_values).length === 0) ? (
                        <p className="text-slate-400 italic text-center mt-10 text-xs">Sin valores anteriores registrados</p>
                     ) : (
                        <ul className="space-y-3">
                           {Object.entries(selectedLog.old_values).map(([k, v]) => (
                              <li key={k} className="flex flex-col border-b border-slate-50 pb-2">
                                 <span className="text-[10px] font-black text-rose-400 uppercase">{k}</span>
                                 <span className="text-sm text-slate-700 break-all">{String(v)}</span>
                              </li>
                           ))}
                        </ul>
                     )}
                  </div>
                </Card>
                <Card padding="none" className="overflow-hidden border border-emerald-100">
                  <div className="bg-emerald-50 p-2 border-b border-emerald-100 text-xs font-black uppercase text-emerald-600 tracking-widest text-center">Valores Nuevos</div>
                  <div className="p-4 bg-white min-h-[150px] overflow-x-auto">
                     {(!selectedLog.new_values || Object.keys(selectedLog.new_values).length === 0) ? (
                        <p className="text-slate-400 italic text-center mt-10 text-xs">Sin valores nuevos registrados</p>
                     ) : (
                        <ul className="space-y-3">
                           {Object.entries(selectedLog.new_values).map(([k, v]) => (
                              <li key={k} className="flex flex-col border-b border-slate-50 pb-2">
                                 <span className="text-[10px] font-black text-emerald-500 uppercase">{k}</span>
                                 <span className="text-sm text-slate-700 break-all">{String(v)}</span>
                              </li>
                           ))}
                        </ul>
                     )}
                  </div>
                </Card>
              </div>

              {selectedLog.observations && (
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Observaciones</p>
                  <Card className="p-3 bg-white text-sm text-slate-600 font-mono">{selectedLog.observations}</Card>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

    </ModulePage>
  );
}
