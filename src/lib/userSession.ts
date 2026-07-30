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
  // No borrar otras filas aquí: el API (service role) ya aplica single-PC.
  // El fallback cliente solo inserta; evita races que dejan localStorage huérfano.
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

function isPresenceKick(status: number, body: unknown): boolean {
  if (status !== 401) return false;
  const err =
    body && typeof body === 'object' && 'error' in body
      ? String((body as { error?: unknown }).error || '')
      : '';
  return err === 'SESSION_GONE' || err === 'SESSION_IDLE';
}

/**
 * Heartbeat de presencia.
 * `true` = mantener sesión Auth (incluye fallos transitorios 429/5xx/red).
 * `false` = expulsión real (otra PC / idle del servidor).
 */
export async function touchUserSession(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const res = await apiFetch('/api/user-session', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });

    if (res.ok) return true;

    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    // Solo expulsar ante kick explícito de presencia. Nunca por 429/500/timeouts.
    if (isPresenceKick(res.status, body)) return false;

    console.warn('[user-session] touch no-ok (se mantiene sesión Auth)', res.status, body);
    return true;
  } catch {
    return true; // no expulsar por fallo de red transitorio
  }
}
