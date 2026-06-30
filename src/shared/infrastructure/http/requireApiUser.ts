import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { appConfig } from '@/lib/app-config';
import { getSupabaseUserServerClient } from '@/lib/supabase/server-user';

/**
 * Verificación de autenticación para rutas /api/*.
 *
 * Orden de resolución:
 *  1) Sesión en cookies (`@supabase/ssr`) — vía principal. El cliente devuelto
 *     respeta RLS (lleva el JWT del usuario), apto para lecturas RLS-first.
 *  2) `Authorization: Bearer <token>` — compatibilidad durante la transición.
 *
 * No hay bypass de desarrollo: en cualquier entorno se exige sesión/token real.
 *
 * Uso en un handler:
 * ```ts
 * const auth = await requireApiUser(req);
 * if (auth instanceof NextResponse) return auth; // 401
 * const user = auth.user;
 * const supabase = auth.supabase; // cliente con RLS (puede ser null si vino por Bearer)
 * ```
 */
export type ApiAuthResult = {
  user: User;
  token: string;
  /** Cliente Supabase con la identidad del usuario (respeta RLS). */
  supabase: SupabaseClient | null;
};

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

  // 1) Sesión en cookies (vía principal, respeta RLS).
  const userClient = await getSupabaseUserServerClient();
  if (userClient) {
    const { data, error } = await userClient.auth.getUser();
    if (!error && data?.user) {
      return { user: data.user, token: '', supabase: userClient };
    }
  }

  // 2) Bearer token (compatibilidad).
  const token = extractBearerToken(req);
  if (token) {
    const supabase = getAuthVerificationClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (!error && data?.user) {
      return { user: data.user, token, supabase: null };
    }
  }

  return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
}
