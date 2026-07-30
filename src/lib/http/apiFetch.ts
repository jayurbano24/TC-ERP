import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/** Un solo refresh en vuelo: evita races de refresh-token que borran la sesión. */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return null;
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn('[apiFetch] refreshSession:', error.message);
        return null;
      }
      return data.session?.access_token ?? null;
    } catch (err) {
      console.warn('[apiFetch] refreshSession failed', err);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

async function attachAuthHeaders(headers: Headers): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;

    if (!token) {
      token = (await refreshAccessToken()) ?? undefined;
    }

    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  } catch {
    // Sin sesión disponible; se hace el fetch con cookies si existen.
  }
}

/**
 * `fetch` para endpoints internos `/api/*` que adjunta el token de sesión.
 *
 * 1) Envía cookies (`credentials: 'same-origin'`) — vía principal de `requireApiUser`.
 * 2) Adjunta `Authorization: Bearer <access_token>` si hay sesión.
 * 3) Si no hay token, intenta `refreshSession()` una vez (sesión caducada tras
 *    cargas largas como G985).
 * 4) Ante 401, refresca JWT y reintenta una vez (evita toast "No autenticado"
 *    por access token corto).
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  await attachAuthHeaders(headers);

  const res = await fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? 'same-origin',
  });

  if (res.status !== 401) return res;

  try {
    const token = await refreshAccessToken();
    if (!token) return res;

    const retryHeaders = new Headers(init.headers);
    retryHeaders.set('Authorization', `Bearer ${token}`);
    return fetch(input, {
      ...init,
      headers: retryHeaders,
      credentials: init.credentials ?? 'same-origin',
    });
  } catch {
    return res;
  }
}

function extractApiErrorText(errorBody: unknown): string {
  if (typeof errorBody === 'string') return errorBody;
  if (!errorBody || typeof errorBody !== 'object') return '';
  const o = errorBody as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ['error', 'message', 'description'] as const) {
    const v = o[key];
    if (typeof v === 'string') parts.push(v);
    else if (v != null) parts.push(JSON.stringify(v));
  }
  return parts.join(' ');
}

/** True si la API respondió sesión Auth inválida (no errores de negocio 401). */
export function isApiAuthFailure(status: number, errorBody: unknown): boolean {
  if (status !== 401) {
    return /not authenticated|session[_ ]?expired/i.test(extractApiErrorText(errorBody));
  }
  const text = extractApiErrorText(errorBody);
  // Kick de presencia ≠ sesión Auth muerta (el shell re-registra).
  if (/SESSION_GONE|SESSION_IDLE/i.test(text)) return false;
  // Solo bounce a login ante denegación explícita de Auth.
  return /no autenticado|not authenticated|session[_ ]?expired|jwt|unauthori[sz]ed/i.test(
    text || 'no autenticado'
  );
}

/** Texto de toast/error que indica sesión caducada. */
export function isAuthFailureText(...parts: Array<string | undefined | null>): boolean {
  return /no autenticado|not authenticated|session[_ ]?expired/i.test(
    parts.filter(Boolean).join(' ')
  );
}

/** Redirige al login sin spamear toasts (sesión caducada). */
export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem('tcerp_session_id');
  } catch {
    /* ignore */
  }
  window.location.assign('/');
}

/** Cuelga la promesa tras redirigir (evita throw → Console Error de Next). */
export async function haltForLoginRedirect(): Promise<never> {
  redirectToLogin();
  await new Promise<never>(() => undefined);
  throw new Error('SESSION_EXPIRED');
}

/**
 * Parsea JSON de `/api/*`. Ante 401 / "No autenticado" redirige al login
 * sin `throw` ni `console.error` (el overlay de Next los copia al clipboard).
 */
export async function readApiJson<T>(res: Response): Promise<T> {
  const payload: unknown = await res.json().catch(() => ({}));
  if (isApiAuthFailure(res.status, payload)) {
    await haltForLoginRedirect();
  }
  if (!res.ok) {
    const obj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
    let msg =
      obj && 'error' in obj && obj.error != null
        ? String(obj.error)
        : `HTTP ${res.status}`;
    const issues = obj && Array.isArray(obj.issues) ? obj.issues : [];
    const firstIssue = issues[0] as { message?: string } | undefined;
    if (
      firstIssue?.message &&
      (/validaci[oó]n de datos fallida/i.test(msg) || msg === `HTTP ${res.status}`)
    ) {
      msg = String(firstIssue.message);
    }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return payload as T;
}

export function isAuthErrorMessage(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /no autenticado|session_expired|not authenticated/i.test(error.message);
}
