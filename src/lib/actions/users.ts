"use server";

import { createClient } from '@supabase/supabase-js';

const getAdminClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Variables de entorno de administrador de Supabase no configuradas. Necesitas SUPABASE_SERVICE_ROLE_KEY en el .env.local');
  }

  // Create a supabase client with the service_role key to bypass RLS and use Admin API
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};

/**
 * Resetea o cambia forzosamente la contraseña de un usuario
 */
export async function adminUpdateUserPassword(userId: string, newPassword: string) {
  try {
    const supabaseAdmin = getAdminClient();
    
    // Auth Admin API para actualizar credenciales
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: newPassword }
    );

    if (error) throw error;
    
    return { success: true, message: "Contraseña actualizada exitosamente" };
  } catch (error: any) {
    console.error("Error in adminUpdateUserPassword:", error);
    return { error: error.message || "Error desconocido al actualizar contraseña" };
  }
}

/**
 * Suspende o reactiva el acceso de un usuario
 * @param isActive true = puede entrar, false = baneado/suspendido
 */
export async function adminToggleUserStatus(userId: string, isActive: boolean) {
  try {
    const supabaseAdmin = getAdminClient();
    
    // Auth Admin API para banear (inhabilitar)
    // El campo de Supabase Auth Admin para banear es 'ban_duration'
    // 'none' remueve el ban, mientras que '876000h' banea por 100 años (efectivamente permanente)
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { ban_duration: isActive ? 'none' : '876000h' }
    );

    if (error) throw error;

    // También debemos actualizar el estatus en nuestra tabla pública `profiles` si existe
    // Asumimos que `is_active` es la columna en profiles.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', userId);

    if (profileError) {
       console.error("Warning: Could not update profile is_active status", profileError);
       // We don't throw here because the main auth block was successful
    }

    return { success: true, message: `Usuario ${isActive ? 'habilitado' : 'inhabilitado'} correctamente` };
  } catch (error: any) {
    console.error("Error in adminToggleUserStatus:", error);
    return { error: error.message || "Error al cambiar el estatus del usuario" };
  }
}

/**
 * Crea un nuevo usuario directamente desde el admin dashboard
 */
export async function adminCreateUser(email: string, password: string, fullName: string, roleId?: string, employeeId?: string) {
  try {
    const supabaseAdmin = getAdminClient();
    
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    });

    if (error) throw error;
    if (!data.user) throw new Error("No se pudo crear el usuario");

    // Supabase will automatically insert into `profiles` via a database trigger (usually).
    // But if we need to set role_id or employee_id immediately, or if the trigger is missing:
    const upsertData: any = {
      id: data.user.id,
      email: email, // Enforce email is present
      full_name: fullName,
      is_active: true
    };
    if (roleId) upsertData.role_id = roleId;
    if (employeeId) upsertData.employee_id = employeeId;

    // Wait a moment for trigger to run (if any) to avoid unique constraint conflicts if upsert isn't well handled
    await new Promise(r => setTimeout(r, 1000));
    
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(upsertData, { onConflict: 'id' });
      
    if (profileError) {
       console.error("Warning: Could not upsert profile data", profileError);
    }

    return { success: true, user: data.user };
  } catch (error: any) {
    console.error("Error in adminCreateUser:", error);
    return { error: error.message || "Error desconocido al crear usuario" };
  }
}
