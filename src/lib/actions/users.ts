"use server";

import { requireServerAdmin, getServiceRoleAdminClient } from '@/shared/authz/requireServerAdmin';

/**
 * Resetea o cambia forzosamente la contraseña de un usuario
 */
export async function adminUpdateUserPassword(userId: string, newPassword: string) {
  const gate = await requireServerAdmin();
  if (!gate.ok) return { error: gate.error };

  try {
    const supabaseAdmin = getServiceRoleAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) throw error;
    return { success: true, message: "Contraseña actualizada exitosamente" };
  } catch (error: unknown) {
    console.error("Error in adminUpdateUserPassword:", error);
    return { error: error instanceof Error ? error.message : "Error desconocido al actualizar contraseña" };
  }
}

/**
 * Suspende o reactiva el acceso de un usuario
 */
export async function adminToggleUserStatus(userId: string, isActive: boolean) {
  const gate = await requireServerAdmin();
  if (!gate.ok) return { error: gate.error };

  try {
    const supabaseAdmin = getServiceRoleAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: isActive ? 'none' : '876000h',
    });
    if (error) throw error;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ is_active: isActive })
      .eq('id', userId);

    if (profileError) {
      console.error("Warning: Could not update profile is_active status", profileError);
    }

    return { success: true, message: `Usuario ${isActive ? 'habilitado' : 'inhabilitado'} correctamente` };
  } catch (error: unknown) {
    console.error("Error in adminToggleUserStatus:", error);
    return { error: error instanceof Error ? error.message : "Error al cambiar el estatus del usuario" };
  }
}

/**
 * Crea un nuevo usuario directamente desde el admin dashboard
 */
export async function adminCreateUser(
  email: string,
  password: string,
  fullName: string,
  roleId?: string,
  employeeId?: string
) {
  const gate = await requireServerAdmin();
  if (!gate.ok) return { error: gate.error };

  try {
    const supabaseAdmin = getServiceRoleAdminClient();

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error) throw error;
    if (!data.user) throw new Error("No se pudo crear el usuario");

    const upsertData: Record<string, unknown> = {
      id: data.user.id,
      email,
      full_name: fullName,
      is_active: true,
    };
    if (roleId) upsertData.role_id = roleId;
    if (employeeId) upsertData.employee_id = employeeId;

    await new Promise((r) => setTimeout(r, 300));

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert(upsertData);
    if (profileError) {
      console.error("Profile upsert warning:", profileError);
    }

    return { success: true, user: data.user, message: "Usuario creado exitosamente" };
  } catch (error: unknown) {
    console.error("Error in adminCreateUser:", error);
    return { error: error instanceof Error ? error.message : "Error al crear usuario" };
  }
}
