import { getSupabaseBrowserClient } from '@/lib/supabase/client';

async function attachAuthHeaders(headers: Headers): Promise<void> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    let { data } = await supabase.auth.getSession();
    let token = data.session?.access_token;

    if (!token) {
      const refreshed = await supabase.auth.refreshSession();
      data = refreshed.data;
      token = data.session?.access_token ?? undefined;
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
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return res;
    const refreshed = await supabase.auth.refreshSession();
    const token = refreshed.data.session?.access_token;
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

/** True si la API respondió sesión inválida / middleware 401. */
export function isApiAuthFailure(status: number, errorBody: unknown): boolean {
  if (status === 401) return true;
  return /no autenticado|not authenticated|session[_ ]?expired/i.test(
    extractApiErrorText(errorBody)
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
    const msg =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `HTTP ${res.status}`;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return payload as T;
}

export function isAuthErrorMessage(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /no autenticado|session_expired|not authenticated/i.test(error.message);
}
