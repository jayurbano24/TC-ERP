import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * `fetch` para endpoints internos `/api/*` que adjunta el token de sesión.
 *
 * 1) Envía cookies (`credentials: 'same-origin'`) — vía principal de `requireApiUser`.
 * 2) Adjunta `Authorization: Bearer <access_token>` si hay sesión.
 * 3) Si no hay token, intenta `refreshSession()` una vez (sesión caducada tras
 *    cargas largas como G985).
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  try {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      let { data } = await supabase.auth.getSession();
      let token = data.session?.access_token;

      if (!token) {
        const refreshed = await supabase.auth.refreshSession();
        data = refreshed.data;
        token = data.session?.access_token ?? undefined;
      }

      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }
  } catch {
    // Sin sesión disponible; se hace el fetch con cookies si existen.
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? 'same-origin',
  });
}
