import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * `fetch` para endpoints internos `/api/*` que adjunta el token de sesión.
 *
 * Toma el `access_token` de la sesión Supabase actual y lo envía como
 * `Authorization: Bearer <token>`, que es lo que `requireApiUser` valida en el
 * servidor. Si no hay sesión, hace el fetch sin header (la ruta responderá 401
 * si exige autenticación). Reemplaza a `fetch('/api/...')` directo en el cliente.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  try {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token && !headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }
  } catch {
    // Sin sesión disponible; se hace el fetch sin token.
  }

  return fetch(input, { ...init, headers });
}
