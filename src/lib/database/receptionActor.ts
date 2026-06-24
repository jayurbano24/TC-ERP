import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type ReceptionActor = {
  userId: string | null;
  fullName: string;
};

/** Usuario autenticado que realiza la recepción (profiles.id = auth.users.id). */
export async function getCurrentReceptionActor(): Promise<ReceptionActor> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { userId: null, fullName: 'OPERADOR_SISTEMA' };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return { userId: null, fullName: 'OPERADOR_SISTEMA' };

  let fullName =
    typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';

  if (!fullName) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();
    fullName = profile?.full_name?.trim() || user.email?.split('@')[0] || 'OPERADOR_SISTEMA';
  }

  return { userId: user.id, fullName };
}
