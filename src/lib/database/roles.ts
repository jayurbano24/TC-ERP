'use server';

import { createClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return createClient(url, key, { auth: { persistSession: false } });
};


// Get all roles
export async function getRoles() {
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('erp_roles').select('*').order('name');
  if (error) {
    const errorMsg = error instanceof Error ? error.message : (error as any).message || JSON.stringify(error);
    console.error("Error fetching roles:", errorMsg, error);
  }
  return data || [];
}

// Get permissions for a specific role
export async function getRolePermissions(roleId: string) {
  const supabase = getAdminClient();
  if (!supabase) return [];
  const { data, error } = await supabase.from('erp_role_permissions').select('*').eq('role_id', roleId);
  if (error) console.error("Error fetching permissions:", error);
  return data || [];
}

// Upsert a permission for a role
export async function updateRolePermission(roleId: string, moduleName: string, field: string, value: boolean) {
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
  const supabase = getAdminClient();
  if (!supabase) return [];
  
  const profilesData = await getProfiles();
  const { data: erpRoles } = await supabase.from('erp_roles').select('*');
  
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
      avatar_url: p.avatar_url
    };
  });
}

// Get user security settings
export async function getUserSecurity(userId: string) {
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
  const supabase = getAdminClient();
  if (!supabase) return { error: "Supabase not configured" };

  const { data: existing } = await supabase.from('user_roles').select('id').eq('user_id', userId).single();

  let result;
  if (existing) {
    result = await supabase
      .from('user_roles')
      .update({ role_id: roleId })
      .eq('user_id', userId);
  } else {
    // Si no existe, insertamos solo con role_id
    // Si la DB requiere un 'role' (enum), esto podría fallar, pero como
    // app_role es problemático, omitimos enviarlo asumiendo que tiene un DEFAULT
    result = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role_id: roleId });
  }

  if (result.error) return { error: result.error.message };
  return { success: true };
}
