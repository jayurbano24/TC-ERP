import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/http/apiFetch';

/** Registra sesión única por PC (API con service role, fallback Supabase cliente). */
export async function registerUserSession(userId: string): Promise<string | null> {
  if (!userId || userId === 'dev-user') return null;

  try {
    const res = await apiFetch('/api/user-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.sessionId) {
        localStorage.setItem('tcerp_session_id', data.sessionId);
        return data.sessionId as string;
      }
    }
  } catch {
    // API no disponible (p. ej. Turbopack dev); intentar vía cliente
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  await supabase.from('user_sessions').delete().eq('user_id', userId);
  const { data, error } = await supabase
    .from('user_sessions')
    .insert({ user_id: userId, ip_address: 'browser' })
    .select('id')
    .single();

  if (error || !data?.id) {
    console.warn('No se pudo registrar user_sessions:', error?.message);
    return null;
  }

  localStorage.setItem('tcerp_session_id', data.id);
  return data.id as string;
}
