"use server";

import { requireServerAdmin, getServiceRoleAdminClient } from '@/shared/authz/requireServerAdmin';

type AdminClient = ReturnType<typeof getServiceRoleAdminClient>;

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
 * Busca un usuario Auth ya registrado por correo (profiles → Auth admin).
 */
async function findUserIdByEmail(
  supabaseAdmin: AdminClient,
  email: string
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .ilike('email', normalized)
    .maybeSingle();
  if (profile?.id) return String(profile.id);

  for (let page = 1; page <= 25; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) break;
    const hit = data.users.find((u) => (u.email || '').toLowerCase() === normalized);
    if (hit?.id) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

function isEmailAlreadyRegisteredError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('already been registered') ||
    m.includes('already registered') ||
    m.includes('user already exists') ||
    m.includes('email_exists')
  );
}

/**
 * El directorio lee roles desde `user_roles`, no desde `profiles.role_id`.
 */
async function assignRoleToUser(
  supabaseAdmin: AdminClient,
  userId: string,
  roleId: string
): Promise<void> {
  const { data: pos, error: posError } = await supabaseAdmin
    .from('hr_positions')
    .select('id, name')
    .eq('id', roleId)
    .maybeSingle();

  if (posError) throw posError;
  if (!pos?.name) throw new Error('Rol no encontrado en catálogo de puestos');

  await supabaseAdmin.rpc('add_app_role_value', { new_role: pos.name });

  const { data: existing } = await supabaseAdmin
    .from('user_roles')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from('user_roles')
      .update({ role_id: roleId, role: pos.name })
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabaseAdmin.from('user_roles').insert({
      user_id: userId,
      role_id: roleId,
      role: pos.name,
    });
    if (error) throw error;
  }

  // Asegura enum operacional (tecnico, qc, …) además del nombre de puesto RRHH.
  await supabaseAdmin.rpc('app_sync_operational_role_from_position', {
    p_user_id: userId,
  });
}

/**
 * Crea/actualiza el perfil visible en Directorio de Cuentas.
 * Importante: NO escribir role_id en profiles (esa columna no existe; el rol va a user_roles).
 */
async function upsertProfileForAccess(params: {
  supabaseAdmin: AdminClient;
  userId: string;
  email: string;
  fullName: string;
  employeeId?: string;
  roleId?: string;
}): Promise<void> {
  const { supabaseAdmin, userId, email, fullName, employeeId, roleId } = params;

  if (employeeId) {
    await supabaseAdmin
      .from('profiles')
      .update({ employee_id: null })
      .eq('employee_id', employeeId)
      .neq('id', userId);
  }

  const upsertData: Record<string, unknown> = {
    id: userId,
    email: email.trim().toLowerCase(),
    full_name: fullName,
    is_active: true,
  };
  if (employeeId) upsertData.employee_id = employeeId;

  const { error: profileError } = await supabaseAdmin.from('profiles').upsert(upsertData);
  if (profileError) {
    throw new Error(`No se pudo guardar el perfil en el directorio: ${profileError.message}`);
  }

  if (roleId) {
    await assignRoleToUser(supabaseAdmin, userId, roleId);
  }

  if (employeeId && email) {
    const { error: empEmailError } = await supabaseAdmin
      .from('employees')
      .update({ email: email.trim().toLowerCase() })
      .eq('id', employeeId);
    if (empEmailError) {
      console.error('Employee email sync warning:', empEmailError);
    }
  }
}

/**
 * Enlaza un usuario Auth existente: clave + perfil + empleado RRHH (sin recrear cuenta).
 */
async function linkExistingAuthUser(params: {
  supabaseAdmin: AdminClient;
  userId: string;
  email: string;
  password: string;
  fullName: string;
  roleId?: string;
  employeeId?: string;
}) {
  const { supabaseAdmin, userId, email, password, fullName, roleId, employeeId } = params;

  if (password && password.length >= 6) {
    const { error: pwdError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (pwdError) throw pwdError;
  }

  await upsertProfileForAccess({
    supabaseAdmin,
    userId,
    email,
    fullName,
    employeeId,
    roleId,
  });

  return {
    success: true as const,
    linked: true as const,
    user: { id: userId, email },
    message:
      'Usuario existente enlazado: se actualizó la contraseña y el vínculo con el empleado RRHH.',
  };
}

/**
 * Crea un nuevo usuario desde Seguridad.
 * Si el correo ya existe en Auth, enlaza esa cuenta (clave + rol + empleado) en lugar de fallar.
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
    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (error) {
      if (!isEmailAlreadyRegisteredError(error.message)) throw error;

      const existingId = await findUserIdByEmail(supabaseAdmin, normalizedEmail);
      if (!existingId) {
        return {
          error:
            'El correo ya está registrado en Auth, pero no se pudo localizar el usuario para enlazarlo. Edítalo desde la lista de usuarios.',
        };
      }

      return await linkExistingAuthUser({
        supabaseAdmin,
        userId: existingId,
        email: normalizedEmail,
        password,
        fullName,
        roleId,
        employeeId,
      });
    }

    if (!data.user) throw new Error('No se pudo crear el usuario');

    // Pequeña espera por si hay trigger async sobre auth.users.
    await new Promise((r) => setTimeout(r, 300));

    await upsertProfileForAccess({
      supabaseAdmin,
      userId: data.user.id,
      email: normalizedEmail,
      fullName,
      employeeId,
      roleId,
    });

    return { success: true, linked: false, user: data.user, message: 'Usuario creado exitosamente' };
  } catch (error: unknown) {
    console.error('Error in adminCreateUser:', error);
    return { error: error instanceof Error ? error.message : 'Error al crear usuario' };
  }
}
