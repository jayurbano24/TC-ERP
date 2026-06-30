'use server';

import { createClient } from '@supabase/supabase-js';
import { getSupabaseUserServerClient } from '@/lib/supabase/server-user';

const getAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key, { auth: { persistSession: false } });
};

// Módulo que gobierna la administración de roles/permisos/seguridad.
const SECURITY_MODULE = 'Seguridad';

/**
 * Autorización server-side para administrar roles/permisos/seguridad,
 * gobernada por PERMISO DE MÓDULO (no por un rol hardcodeado).
 *
 * Estas server actions usan el service role (saltan RLS), por lo que la barrera
 * de seguridad debe imponerse aquí, NO en el cliente. La autoridad es el helper
 * SQL `app_can(module, action)` (RLS-first, ADR-011), evaluado con la IDENTIDAD
 * del usuario logueado (JWT en cookies). `app_can` ya concede acceso total a
 * GERENTE GENERAL vía `app_is_admin()`, por lo que el admin sigue siendo el
 * respaldo. Falla cerrado: sin sesión, sin permiso o ante error → false.
 *
 * @param action 'view' para lecturas, 'edit' para escrituras (ver matriz).
 */
async function callerCan(action: 'view' | 'edit'): Promise<boolean> {
  const supabase = await getSupabaseUserServerClient();
  if (!supabase) return false;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return false;
  const { data, error } = await supabase.rpc('app_can', {
    p_module: SECURITY_MODULE,
    p_action: action,
  });
  if (error) {
    console.error('[authz] Verificación app_can(Seguridad) falló:', error.message);
    return false;
  }
  return data === true;
}


// Get all roles
export async function getRoles() {
  if (!(await callerCan('view'))) return [];
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('hr_positions').select('*').order('name');
  if (error) {
    const errorMsg = error instanceof Error ? error.message : (error as any).message || JSON.stringify(error);
    console.error("Error fetching roles:", errorMsg, error);
  }
  return (data || []).map(pos => ({
    id: pos.id,
    name: pos.name,
    description: pos.description || `Puesto del departamento de RRHH`
  }));
}

// Get permissions for a specific role
export async function getRolePermissions(roleId: string) {
  if (!(await callerCan('view'))) return [];
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('erp_role_permissions').select('*').eq('role_id', roleId);
  if (error) console.error("Error fetching permissions:", error);
  return data || [];
}

// Upsert a permission for a role
export async function updateRolePermission(roleId: string, moduleName: string, field: string, value: boolean) {
  if (!(await callerCan('edit'))) return { error: "No autorizado" };
  const supabase = getAdminClient();
  if (!supabase) return { error: "Supabase not configured" };

  // First try to check if the permission record exists
  const { data: existing } = await supabase
    .from('erp_role_permissions')
    .select('id')
    .eq('role_id', roleId)
    .eq('module_name', moduleName)
    .single();

  let result;
  if (existing) {
    result = await supabase
      .from('erp_role_permissions')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    result = await supabase
      .from('erp_role_permissions')
      .insert({
        role_id: roleId,
        module_name: moduleName,
        [field]: value
      });
  }

  if (result.error) {
    console.error("Error updating permission:", result.error);
    return { error: result.error.message };
  }
  return { success: true };
}

import { getProfiles } from './config';

// Get users with their current assigned roles
export async function getUsersWithRoles() {
  if (!(await callerCan('view'))) return [];
  const supabase = getAdminClient();
  if (!supabase) return [];
  
  const { data: profilesData, error: profilesError } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      is_active,
      created_at,
      avatar_url,
      employee_id,
      employees ( codigo_empleado, nombre_completo ),
      user_roles ( role, role_id )
    `)
    .order('created_at', { ascending: false });

  if (profilesError) {
    console.error("Error fetching profiles as admin:", profilesError);
  }

  const { data: erpRoles } = await supabase.from('hr_positions').select('*');
  
  return (profilesData || []).map((p: any) => {
    // getProfiles returns user_roles inside the profile object (p.user_roles)
    // usually it's an array or a single object depending on relation
    let roleName = 'Sin Rol';
    let roleId: any = null;

    if (p.user_roles) {
      if (Array.isArray(p.user_roles) && p.user_roles.length > 0) {
        roleName = p.user_roles[0].role || 'Sin Rol';
        roleId = p.user_roles[0].role_id || null;
      } else if (!Array.isArray(p.user_roles)) {
        roleName = p.user_roles.role || 'Sin Rol';
        roleId = p.user_roles.role_id || null;
      }
    }

    if (!roleId && roleName && roleName !== 'Sin Rol' && erpRoles) {
      const matchedRole = erpRoles.find((r: any) => r.name === roleName);
      if (matchedRole) {
        roleId = matchedRole.id;
      }
    } else if (roleId && erpRoles) {
      const matchedRole = erpRoles.find((r: any) => r.id === roleId);
      if (matchedRole) {
        roleName = matchedRole.name;
      }
    }
    
    return {
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      status: p.is_active !== false ? 'Activo' : 'Inactivo',
      last_login: null,
      role: roleName,
      role_id: roleId,
      avatar_url: p.avatar_url,
      employee_code: p.employees?.codigo_empleado || null,
      employee_id: p.employee_id
    };
  });
}

// Get user security settings
export async function getUserSecurity(userId: string) {
  if (!(await callerCan('view'))) return null;
  const supabase = getAdminClient();
  if (!supabase) return null;
  const { data, error } = await supabase.from('erp_user_security').select('*').eq('user_id', userId).single();
  if (error && error.code !== 'PGRST116') { // PGRST116 is not found
    console.error("Error fetching user security:", error);
  }
  return data || {
    user_id: userId,
    force_pwd_change: false,
    require_2fa: false,
    failed_attempts: 0,
    locked_until: null,
    allowed_ips: []
  };
}

// Update user security setting
export async function updateUserSecurity(userId: string, field: string, value: any) {
  if (!(await callerCan('edit'))) return { error: "No autorizado" };
  const supabase = getAdminClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data: existing } = await supabase.from('erp_user_security').select('user_id').eq('user_id', userId).single();

  let result;
  if (existing) {
    result = await supabase
      .from('erp_user_security')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
  } else {
    result = await supabase
      .from('erp_user_security')
      .insert({
        user_id: userId,
        [field]: value
      });
  }

  if (result.error) {
    console.error("Error updating user security:", result.error);
    return { error: result.error.message };
  }
  return { success: true };
}

// Change User Role
export async function changeUserRole(userId: string, roleId: string, roleName: string) {
  if (!(await callerCan('edit'))) return { error: "No autorizado" };
  const supabase = getAdminClient();
  if (!supabase) return { error: "Supabase not configured" };

  // 1. Asegurarnos que el Enum de la base de datos contenga este nuevo Puesto de RRHH
  await supabase.rpc('add_app_role_value', { new_role: roleName });

  const { data: existing } = await supabase.from('user_roles').select('id').eq('user_id', userId).single();

  let result;
  if (existing) {
    result = await supabase
      .from('user_roles')
      .update({ role_id: roleId, role: roleName })
      .eq('user_id', userId);
  } else {
    result = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role_id: roleId, role: roleName });
  }

  if (result.error) return { error: result.error.message };
  return { success: true };
}
