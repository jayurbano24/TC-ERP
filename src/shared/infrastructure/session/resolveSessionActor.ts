import type { User } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export type SessionActor = {
  userId: string;
  fullName: string;
};

/** Resuelve operador actual (metadata → profiles → email) en servidor. */
export async function resolveSessionActor(user: User): Promise<SessionActor> {
  let fullName =
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';

  if (!fullName) {
    const supabase = getSupabaseServerClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    fullName = profile?.full_name?.trim() || '';
  }

  if (!fullName) {
    fullName = user.email?.split('@')[0]?.trim() || 'OPERADOR_SISTEMA';
  }

  return { userId: user.id, fullName };
}
