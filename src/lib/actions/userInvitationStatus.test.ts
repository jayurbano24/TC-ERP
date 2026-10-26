import { describe, expect, it } from 'vitest';
import {
  OPEN_INVITATION_STATUSES,
  RECORD_MATCH_STATUSES,
  buildAcceptedInvitationPatch,
  buildRevokedInvitationPatch,
  nextStatusOnResend,
  shouldBanOnRevoke,
} from './userInvitationStatus';

describe('userInvitationStatus', () => {
  it('marca accepted con timestamps', () => {
    const patch = buildAcceptedInvitationPatch('2026-10-26T00:00:00.000Z');
    expect(patch).toEqual({
      status: 'accepted',
      accepted_at: '2026-10-26T00:00:00.000Z',
      updated_at: '2026-10-26T00:00:00.000Z',
    });
  });

  it('revoca sin tocar accepted_at', () => {
    expect(buildRevokedInvitationPatch('2026-10-26T01:00:00.000Z')).toEqual({
      status: 'revoked',
      updated_at: '2026-10-26T01:00:00.000Z',
    });
  });

  it('banea solo si hay auth_user_id y aún no aceptó', () => {
    expect(
      shouldBanOnRevoke({ auth_user_id: 'u1', accepted_at: null })
    ).toBe(true);
    expect(
      shouldBanOnRevoke({ auth_user_id: 'u1', accepted_at: '2026-01-01T00:00:00Z' })
    ).toBe(false);
    expect(shouldBanOnRevoke({ auth_user_id: null, accepted_at: null })).toBe(false);
  });

  it('al reenviar pasa pending → resent e incluye revoked en match', () => {
    expect(nextStatusOnResend('pending', true)).toBe('resent');
    expect(nextStatusOnResend('linked_existing', true)).toBe('linked_existing');
    expect(nextStatusOnResend('pending', false)).toBe('pending');
    expect(RECORD_MATCH_STATUSES).toContain('revoked');
    expect(OPEN_INVITATION_STATUSES).toEqual([
      'pending',
      'resent',
      'linked_existing',
    ]);
  });
});
