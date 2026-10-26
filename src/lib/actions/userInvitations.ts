'use server';

import {
  requireServerSeguridadEdit,
  getServiceRoleAdminClient,
} from '@/shared/authz/requireServerAdmin';
import { getSupabaseUserServerClient } from '@/lib/supabase/server-user';
import {
  OPEN_INVITATION_STATUSES,
  RECORD_MATCH_STATUSES,
  buildAcceptedInvitationPatch,
  buildRevokedInvitationPatch,
  nextStatusOnResend,
  shouldBanOnRevoke,
} from '@/lib/actions/userInvitationStatus';

export type UserInvitationRow = {
  id: string;
  email: string;
  full_name: string;
  role_id: string | null;
  role_name: string | null;
  employee_id: string | null;
  invited_by: string | null;
  auth_user_id: string | null;
  status: string;
  redirect_base: string | null;
  last_error: string | null;
  params: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  last_sent_at: string;
};

function scrubProviderBrand(message: string): string {
  return message
    .replace(/\bsupabase\b/gi, 'el servicio de autenticación')
    .replace(/\bgotrue\b/gi, 'autenticación');
}

export async function listUserInvitations(limit = 100): Promise<{
  rows?: UserInvitationRow[];
  error?: string;
}> {
  const gate = await requireServerSeguridadEdit();
  if (!gate.ok) return { error: gate.error };

  try {
    const supabaseAdmin = getServiceRoleAdminClient();
    const { data, error } = await supabaseAdmin
      .from('user_invitations')
      .select(
        'id, email, full_name, role_id, role_name, employee_id, invited_by, auth_user_id, status, redirect_base, last_error, params, created_at, updated_at, accepted_at, last_sent_at'
      )
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 500));

    if (error) throw error;
    return { rows: (data || []) as UserInvitationRow[] };
  } catch (error: unknown) {
    console.error('listUserInvitations:', error);
    return {
      error:
        error instanceof Error
          ? scrubProviderBrand(error.message)
          : 'No se pudieron cargar las invitaciones',
    };
  }
}

export type RecordInvitationInput = {
  email: string;
  fullName: string;
  roleId?: string | null;
  roleName?: string | null;
  employeeId?: string | null;
  authUserId?: string | null;
  status: UserInvitationRow['status'] | string;
  redirectBase?: string | null;
  lastError?: string | null;
  params?: Record<string, unknown>;
};

/** Inserta o actualiza el registro operativo de una invitación (service role). */
export async function recordUserInvitation(
  input: RecordInvitationInput
): Promise<{ id?: string; error?: string }> {
  const gate = await requireServerSeguridadEdit();
  if (!gate.ok) return { error: gate.error };

  try {
    const supabaseAdmin = getServiceRoleAdminClient();
    const email = input.email.trim().toLowerCase();
    const now = new Date().toISOString();
    const actor = gate.userId;

    const payload = {
      email,
      full_name: input.fullName.trim(),
      role_id: input.roleId || null,
      role_name: input.roleName || null,
      employee_id: input.employeeId || null,
      invited_by: actor,
      auth_user_id: input.authUserId || null,
      status: input.status,
      redirect_base: input.redirectBase || null,
      last_error: input.lastError ? scrubProviderBrand(input.lastError) : null,
      params: input.params || {},
      updated_at: now,
      last_sent_at: now,
      accepted_at: input.status === 'accepted' || input.status === 'linked_existing' ? now : null,
    };

    const { data: existing } = await supabaseAdmin
      .from('user_invitations')
      .select('id')
      .eq('email', email)
      .in('status', [...RECORD_MATCH_STATUSES])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      const nextStatus = nextStatusOnResend(input.status, true);
      const { data, error } = await supabaseAdmin
        .from('user_invitations')
        .update({
          ...payload,
          status: nextStatus,
          // Al reactivar una revocada, limpiar accepted_at si vuelve a pending/resent
          accepted_at:
            nextStatus === 'accepted' || nextStatus === 'linked_existing' ? now : null,
        })
        .eq('id', existing.id)
        .select('id')
        .single();
      if (error) throw error;
      return { id: data.id };
    }

    const { data, error } = await supabaseAdmin
      .from('user_invitations')
      .insert({ ...payload, created_at: now })
      .select('id')
      .single();
    if (error) throw error;
    return { id: data.id };
  } catch (error: unknown) {
    console.error('recordUserInvitation:', error);
    return {
      error:
        error instanceof Error
          ? scrubProviderBrand(error.message)
          : 'No se pudo registrar la invitación',
    };
  }
}

/**
 * Marca invitaciones abiertas del usuario de sesión como accepted
 * (tras definir contraseña en /auth/actualizar-password).
 */
export async function markCurrentUserInvitationAccepted(): Promise<{ ok: boolean }> {
  try {
    const userClient = await getSupabaseUserServerClient();
    if (!userClient) return { ok: false };

    const { data, error } = await userClient.auth.getUser();
    const user = data?.user;
    if (error || !user?.id) return { ok: false };

    const email = (user.email || '').trim().toLowerCase();
    const supabaseAdmin = getServiceRoleAdminClient();
    const patch = buildAcceptedInvitationPatch(new Date().toISOString());

    let query = supabaseAdmin
      .from('user_invitations')
      .update(patch)
      .in('status', [...OPEN_INVITATION_STATUSES]);

    if (email) {
      query = query.or(`auth_user_id.eq.${user.id},email.eq.${email}`);
    } else {
      query = query.eq('auth_user_id', user.id);
    }

    const { error: updateError } = await query;
    if (updateError) {
      console.error('markCurrentUserInvitationAccepted:', updateError);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error('markCurrentUserInvitationAccepted:', err);
    return { ok: false };
  }
}

export async function revokeUserInvitation(invitationId: string): Promise<{
  success?: boolean;
  error?: string;
}> {
  const gate = await requireServerSeguridadEdit();
  if (!gate.ok) return { error: gate.error };

  try {
    const supabaseAdmin = getServiceRoleAdminClient();
    const { data: row, error: readError } = await supabaseAdmin
      .from('user_invitations')
      .select('id, auth_user_id, email, status, accepted_at')
      .eq('id', invitationId)
      .maybeSingle();

    if (readError) throw readError;
    if (!row) return { error: 'Invitación no encontrada' };

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from('user_invitations')
      .update(buildRevokedInvitationPatch(now))
      .eq('id', invitationId);
    if (error) throw error;

    if (shouldBanOnRevoke(row) && row.auth_user_id) {
      const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(
        row.auth_user_id,
        { ban_duration: '876000h' }
      );
      if (banError) {
        console.error('revokeUserInvitation ban:', banError);
      }

      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ is_active: false })
        .eq('id', row.auth_user_id);
      if (profileError) {
        console.error('revokeUserInvitation profile:', profileError);
      }
    }

    return { success: true };
  } catch (error: unknown) {
    return {
      error:
        error instanceof Error
          ? scrubProviderBrand(error.message)
          : 'No se pudo revocar la invitación',
    };
  }
}

/**
 * Elimina el registro operativo de la invitación (no toca Auth ni perfiles).
 * Útil para limpiar filas failed/revoked con correo inválido.
 */
export async function deleteUserInvitation(invitationId: string): Promise<{
  success?: boolean;
  error?: string;
}> {
  const gate = await requireServerSeguridadEdit();
  if (!gate.ok) return { error: gate.error };

  try {
    const supabaseAdmin = getServiceRoleAdminClient();
    const { data: row, error: readError } = await supabaseAdmin
      .from('user_invitations')
      .select('id')
      .eq('id', invitationId)
      .maybeSingle();

    if (readError) throw readError;
    if (!row) return { error: 'Invitación no encontrada' };

    const { error } = await supabaseAdmin
      .from('user_invitations')
      .delete()
      .eq('id', invitationId);
    if (error) throw error;

    return { success: true };
  } catch (error: unknown) {
    return {
      error:
        error instanceof Error
          ? scrubProviderBrand(error.message)
          : 'No se pudo eliminar la invitación',
    };
  }
}
