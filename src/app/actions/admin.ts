'use server';

import { requireServerAdmin, getServiceRoleAdminClient } from '@/shared/authz/requireServerAdmin';

export async function adminChangeUserPassword(userId: string, newPassword: string) {
  const gate = await requireServerAdmin();
  if (!gate.ok) return { error: gate.error };

  try {
    const adminAuthClient = getServiceRoleAdminClient();
    const { error } = await adminAuthClient.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) return { error: error.message };
    return { success: true };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : 'Error al cambiar contraseña' };
  }
}
