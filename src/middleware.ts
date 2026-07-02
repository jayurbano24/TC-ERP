import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { checkRateLimit, type RateLimitResult } from '@/lib/security/rateLimit';

/**
 * Middleware de seguridad:
 *  1) Aplica cabeceras de protección a todas las respuestas.
 *  2) Refresca la sesión Supabase desde cookies (`@supabase/ssr`) en cada request.
 *  3) Limita la tasa de peticiones a `/api/*` por IP (SEC-03) para mitigar abuso,
 *     scraping y fuerza bruta, con un cupo más estricto en endpoints costosos.
 *  4) Exige autenticación en las rutas `/api/*`, salvo las públicas (health-check
 *     y endpoints de dispositivos biométricos iclock).
 *
 * Enforcement de auth (SEC-01): la sesión viaja en cookies httpOnly-ish gestionadas
 * por `@supabase/ssr`; aquí se valida con `auth.getUser()`. Como compatibilidad
 * durante la transición se acepta además un `Authorization: Bearer <token>` válido.
 * No existe bypass de desarrollo: en cualquier entorno se exige sesión/token real.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

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

/** Cabeceras de correlación end-to-end (Q2.5-10). */
const CORRELATION_HEADER = 'x-correlation-id';
const REQUEST_ID_HEADER = 'x-request-id';

/** Rutas /api que NO requieren auth de usuario (dispositivos / health). */
function isPublicApiPath(pathname: string): boolean {
  return pathname === '/api/health' || pathname.startsWith('/api/iclock');
}

/**
 * Reutiliza el correlation/request id entrante (si un proxy o cliente ya lo
 * envió) o genera uno nuevo. Usa el `crypto` global (Web Crypto) disponible en
 * el runtime de middleware; no importa el módulo `crypto` de Node.
 */
function getOrCreateCorrelationId(req: NextRequest): string {
  return (
    req.headers.get(CORRELATION_HEADER) ||
    req.headers.get(REQUEST_ID_HEADER) ||
    crypto.randomUUID()
  );
}

/** Expone el correlation/request id en la respuesta para trazabilidad. */
function applyCorrelationHeaders(res: NextResponse, correlationId: string): NextResponse {
  res.headers.set(CORRELATION_HEADER, correlationId);
  res.headers.set(REQUEST_ID_HEADER, correlationId);
  return res;
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

/** Evita 504 en Vercel si Supabase está caído o reiniciando tras upgrade. */
const SUPABASE_AUTH_TIMEOUT_MS = 5_000;

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
    const res = await withTimeout(
      fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
        cache: 'no-store',
      }),
      SUPABASE_AUTH_TIMEOUT_MS,
      null,
    );
    return res?.ok ?? false;
  } catch {
    return false;
  }
}

/** Acepta un Bearer token válido como compatibilidad (apiFetch legacy). */
async function hasValidBearer(req: NextRequest): Promise<boolean> {
  const token = getBearerToken(req);
  return Boolean(token && (await isValidSupabaseToken(token)));
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
  // Q2.5-10: un único correlation/request id por petición, propagado al handler
  // (vía request headers) y expuesto en la respuesta para trazabilidad e2e.
  const correlationId = getOrCreateCorrelationId(req);

  // Propaga el id al handler aguas abajo reescribiendo las cabeceras de la request.
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(CORRELATION_HEADER, correlationId);
  requestHeaders.set(REQUEST_ID_HEADER, correlationId);

  // Sesión Supabase desde cookies (@supabase/ssr). El cliente escribe las cookies
  // refrescadas en `response`, que se reconstruye en `setAll`.
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  let sessionUser: { id: string } | null = null;

  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    });

    try {
      const { data } = await withTimeout(
        supabase.auth.getUser(),
        SUPABASE_AUTH_TIMEOUT_MS,
        { data: { user: null }, error: null },
      );
      sessionUser = data.user ? { id: data.user.id } : null;
    } catch {
      sessionUser = null;
    }
  }

  let rateLimit: RateLimitResult | null = null;

  if (pathname.startsWith('/api/') && !isPublicApiPath(pathname)) {
    // SEC-03: rate limiting por IP antes de cualquier trabajo costoso.
    const rl = enforceRateLimit(req, pathname);
    if (rl instanceof NextResponse) {
      return applyCorrelationHeaders(applySecurityHeaders(rl), correlationId);
    }
    rateLimit = rl;

    // SEC-01: exige sesión (cookies) o, como compatibilidad, Bearer válido.
    const authed = Boolean(sessionUser) || (await hasValidBearer(req));
    if (!authed) {
      const denied = NextResponse.json({ error: 'No autenticado' }, { status: 401 });
      return applyCorrelationHeaders(
        applySecurityHeaders(applyRateLimitHeaders(denied, rateLimit)),
        correlationId
      );
    }
  }

  response = applyCorrelationHeaders(applySecurityHeaders(response), correlationId);
  return rateLimit ? applyRateLimitHeaders(response, rateLimit) : response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
