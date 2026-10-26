/**
 * Reglas puras de estado de invitaciones (testables sin DB).
 */

export const OPEN_INVITATION_STATUSES = [
  'pending',
  'resent',
  'linked_existing',
] as const;

export const RECORD_MATCH_STATUSES = [
  'pending',
  'resent',
  'failed',
  'revoked',
] as const;

export type InvitationLifecycleStatus =
  | 'pending'
  | 'accepted'
  | 'linked_existing'
  | 'failed'
  | 'revoked'
  | 'resent';

/** Al reenviar sobre una fila abierta/fallida/revocada. */
export function nextStatusOnResend(
  inputStatus: string,
  hadExistingOpenRow: boolean
): string {
  if (!hadExistingOpenRow) return inputStatus;
  if (inputStatus === 'pending' || inputStatus === 'resent') return 'resent';
  return inputStatus;
}

/** ¿Se debe banear Auth al revocar? Solo si hay auth_user_id y aún no aceptó. */
export function shouldBanOnRevoke(row: {
  auth_user_id: string | null;
  accepted_at: string | null;
}): boolean {
  return Boolean(row.auth_user_id) && row.accepted_at == null;
}

/** Patch aplicado al marcar accepted. */
export function buildAcceptedInvitationPatch(nowIso: string): {
  status: 'accepted';
  accepted_at: string;
  updated_at: string;
} {
  return {
    status: 'accepted',
    accepted_at: nowIso,
    updated_at: nowIso,
  };
}

/** Patch aplicado al revocar. */
export function buildRevokedInvitationPatch(nowIso: string): {
  status: 'revoked';
  updated_at: string;
} {
  return {
    status: 'revoked',
    updated_at: nowIso,
  };
}
