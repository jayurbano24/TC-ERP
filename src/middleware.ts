import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit, type RateLimitResult } from '@/lib/security/rateLimit';

/**
 * Middleware de seguridad:
 *  1) Aplica cabeceras de protección a todas las respuestas.
 *  2) Limita la tasa de peticiones a `/api/*` por IP (SEC-03) para mitigar abuso,
 *     scraping y fuerza bruta, con un cupo más estricto en endpoints costosos.
 *  3) Exige autenticación en las rutas `/api/*` (modelo Bearer token), salvo las
 *     públicas (health-check y endpoints de dispositivos biométricos iclock).
 *
 * Enforcement de auth (SEC-01): el navegador adjunta el access_token de Supabase
 * vía `apiFetch`; aquí se valida contra `${url}/auth/v1/user`. En desarrollo, con
 * NEXT_PUBLIC_ENABLE_DEV_BYPASS=true, se permite sin token para no romper el flujo
 * dev. En producción (sin esa env) se exige token válido.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';
const DEV_BYPASS = process.env.NEXT_PUBLIC_ENABLE_DEV_BYPASS === 'true';

/** Ventana de rate limiting (SEC-03). */
const RATE_WINDOW_MS = 60_000;
/** Cupo por defecto por IP para `/api/*` autenticadas (uso normal de la UI). */
const RATE_LIMIT_DEFAULT = 150;
/** Cupo estricto para endpoints costosos (consultas SAP, sync, reportes/export). */
const RATE_LIMIT_STRICT = 20;
/** Prefijos de rutas costosas que reciben el cupo estricto. */
const STRICT_PREFIXES = [
  '/api/sap/query',
  '/api/sap/sync',
  '/api/sap/history',
  '/api/reports',
  '/api/backoffice/cac-history/export',
];

/** Rutas /api que NO requieren auth de usuario (dispositivos / health). */
function isPublicApiPath(pathname: string): boolean {
  return pathname === '/api/health' || pathname.startsWith('/api/iclock');
}

/** IP del cliente a partir de las cabeceras de proxy habituales. */
function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Aplica las cabeceras de rate limit a una respuesta. */
function applyRateLimitHeaders(res: NextResponse, result: RateLimitResult): NextResponse {
  res.headers.set('X-RateLimit-Limit', String(result.limit));
  res.headers.set('X-RateLimit-Remaining', String(result.remaining));
  res.headers.set('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  return res;
}

/**
 * Comprueba el rate limit para una petición `/api/*`. Devuelve una respuesta 429
 * si se excedió, o el resultado (para añadir cabeceras informativas) si pasa.
 */
function enforceRateLimit(req: NextRequest, pathname: string): NextResponse | RateLimitResult {
  const strict = STRICT_PREFIXES.some((p) => pathname.startsWith(p));
  const limit = strict ? RATE_LIMIT_STRICT : RATE_LIMIT_DEFAULT;
  const bucket = strict ? 'strict' : 'default';
  const result = checkRateLimit(`${getClientIp(req)}:${bucket}`, limit, RATE_WINDOW_MS);

  if (!result.ok) {
    const res = NextResponse.json(
      { error: 'Demasiadas solicitudes. Inténtalo de nuevo en unos segundos.' },
      { status: 429 }
    );
    res.headers.set('Retry-After', String(result.retryAfterSec));
    return applyRateLimitHeaders(res, result);
  }

  return result;
}

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !value) return null;
  return value.trim() || null;
}

async function isValidSupabaseToken(token: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Devuelve una respuesta 401 si la petición /api no está autenticada; null si pasa. */
async function enforceApiAuth(req: NextRequest): Promise<NextResponse | null> {
  // Dev: con bypass habilitado se permite sin verificación (solo desarrollo).
  if (DEV_BYPASS) return null;

  const token = getBearerToken(req);
  if (token && (await isValidSupabaseToken(token))) return null;

  return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
}

function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('X-Frame-Options', 'SAMEORIGIN');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set(
    'Permissions-Policy',
    'camera=(self), microphone=(), geolocation=(), browsing-topics=()'
  );
  res.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );
  res.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'"
  );
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  let rateLimit: RateLimitResult | null = null;

  if (pathname.startsWith('/api/') && !isPublicApiPath(pathname)) {
    // SEC-03: rate limiting por IP antes de cualquier trabajo costoso.
    const rl = enforceRateLimit(req, pathname);
    if (rl instanceof NextResponse) return applySecurityHeaders(rl);
    rateLimit = rl;

    const denied = await enforceApiAuth(req);
    if (denied) return applySecurityHeaders(applyRateLimitHeaders(denied, rateLimit));
  }

  const res = applySecurityHeaders(NextResponse.next());
  return rateLimit ? applyRateLimitHeaders(res, rateLimit) : res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
