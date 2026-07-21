import type { SupabaseClient } from '@supabase/supabase-js';
import { SESSION_IDLE_MINUTES, sessionIdleCutoffIso } from '@/lib/session/idlePolicy';

export type IdleCleanupResult = {
  deletedSessions: number;
  revokedUsers: number;
  userIds: string[];
};

/**
 * Elimina sesiones ERP sin actividad y revoca refresh tokens Auth (scope global).
 */
export async function cleanupIdleSessions(
  supabase: SupabaseClient,
  options?: { idleMinutes?: number }
): Promise<IdleCleanupResult> {
  const idleMinutes = options?.idleMinutes ?? SESSION_IDLE_MINUTES;
  const cutoff = new Date(Date.now() - idleMinutes * 60_000).toISOString();

  const { data: stale, error } = await supabase
    .from('user_sessions')
    .select('id, user_id')
    .lt('last_seen', cutoff);

  if (error) {
    throw new Error(error.message);
  }

  const rows = stale ?? [];
  if (rows.length === 0) {
    return { deletedSessions: 0, revokedUsers: 0, userIds: [] };
  }

  const ids = rows.map((r) => r.id as string);
  const userIds = [...new Set(rows.map((r) => r.user_id as string).filter(Boolean))];

  const { error: delError } = await supabase.from('user_sessions').delete().in('id', ids);
  if (delError) {
    throw new Error(delError.message);
  }

  let revokedUsers = 0;
  for (const userId of userIds) {
    try {
      const { error: signOutError } = await supabase.auth.admin.signOut(userId, 'global');
      if (!signOutError) revokedUsers += 1;
      else console.warn('[idle_cleanup] signOut', userId, signOutError.message);
    } catch (e) {
      console.warn('[idle_cleanup] signOut exception', userId, e);
    }
  }

  return {
    deletedSessions: ids.length,
    revokedUsers,
    userIds,
  };
}

export { sessionIdleCutoffIso };
