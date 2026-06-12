'use server';

import { createClient } from '@supabase/supabase-js';

export async function adminChangeUserPassword(userId: string, newPassword: string) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !url) {
    return { error: 'Las credenciales de administrador (SUPABASE_SERVICE_ROLE_KEY) no están configuradas en el servidor.' };
  }

  const adminAuthClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const { data, error } = await adminAuthClient.auth.admin.updateUserById(
    userId,
    { password: newPassword }
  );

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
