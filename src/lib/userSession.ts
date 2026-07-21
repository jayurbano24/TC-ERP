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

  const now = new Date().toISOString();
  await supabase.from('user_sessions').delete().eq('user_id', userId);
  const { data, error } = await supabase
    .from('user_sessions')
    .insert({ user_id: userId, ip_address: 'browser', last_seen: now })
    .select('id')
    .single();

  if (error || !data?.id) {
    console.warn('No se pudo registrar user_sessions:', error?.message);
    return null;
  }

  localStorage.setItem('tcerp_session_id', data.id);
  return data.id as string;
}

/**
 * Heartbeat de presencia. `true` = sesión vigente; `false` = idle/expulsado → logout.
 */
export async function touchUserSession(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const res = await apiFetch('/api/user-session', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (res.status === 401) return false;
    return res.ok;
  } catch {
    return true; // no expulsar por fallo de red transitorio
  }
}
