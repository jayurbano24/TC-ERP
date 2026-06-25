import { NextResponse } from 'next/server';
import { createClient, type User } from '@supabase/supabase-js';
import { appConfig } from '@/lib/app-config';

/**
 * Verificación de autenticación para rutas /api/* (modelo Bearer token).
 *
 * El navegador adjunta el `access_token` de la sesión Supabase en el header
 * `Authorization: Bearer <token>` (ver `apiFetch`). Aquí se valida ese token
 * contra Supabase con `auth.getUser(token)`, que comprueba la firma y expiración
 * del JWT. Las rutas que usan service role (saltándose RLS) DEBEN llamar a este
 * guard para no exponer datos a peticiones anónimas.
 *
 * Uso en un handler:
 * ```ts
 * const auth = await requireApiUser(req);
 * if (auth instanceof NextResponse) return auth; // 401
 * const user = auth.user;
 * ```
 */
export type ApiAuthResult = { user: User; token: string };

function getAuthVerificationClient() {
  return createClient(appConfig.supabase.url, appConfig.supabase.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim() || null;
}

export async function requireApiUser(req: Request): Promise<ApiAuthResult | NextResponse> {
  if (!appConfig.supabase.configured) {
    return NextResponse.json({ error: 'Autenticación no configurada' }, { status: 500 });
  }

  const token = extractBearerToken(req);
  if (token) {
    const supabase = getAuthVerificationClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) {
      return { user: data.user, token };
    }
  }

  // Excepción SOLO desarrollo: con el bypass habilitado se permite sin token real
  // para no romper el flujo dev. En producción (env != 'true') esto NO aplica y
  // se exige un token válido.
  if (process.env.NEXT_PUBLIC_ENABLE_DEV_BYPASS === 'true') {
    return { user: { id: 'dev-user', email: 'dev@local' } as User, token: token ?? '' };
  }

  return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
}
