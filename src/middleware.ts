import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { getClientIpFromHeaders } from '@/lib/http/clientIp';
import { checkRateLimit, type RateLimitResult } from '@/lib/security/rateLimit';
import { fireHttpStatusSample } from '@/modules/system-health/server/httpTelemetry';

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
const RATE_LIMIT_DEFAULT = 300;
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

/** Rutas /api que NO requieren auth de usuario (dispositivos / health / cron interno). */
function isPublicApiPath(pathname: string): boolean {
  return (
    pathname === '/api/health' ||
    pathname.startsWith('/api/iclock') ||
    // Telemetría sendBeacon: no lleva Authorization; no debe exigir sesión ni provocar 401 ruidosos.
    pathname === '/api/observability/web-vitals'
  );
}

function isCronInternalPath(pathname: string): boolean {
  return pathname.startsWith('/api/internal/');
}

function isValidCronSecret(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const secret =
    req.headers.get('x-cron-secret')?.trim() ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim();
  return Boolean(secret && secret === expected);
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
  return getClientIpFromHeaders(req.headers);
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
  // Heartbeat de presencia: no debe competir con APIs pesadas ni provocar logout por 429.
  if (pathname === '/api/user-session') {
    return {
      ok: true,
      limit: 1000,
      remaining: 999,
      resetAt: Date.now() + RATE_WINDOW_MS,
      retryAfterSec: 0,
    };
  }
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
const SUPABASE_AUTH_TIMEOUT_MS = 10_000;

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

/** Cookies de sesión @supabase/ssr (`sb-<ref>-auth-token` / chunks). */
function hasSupabaseAuthCookie(req: NextRequest): boolean {
  return req.cookies.getAll().some(
    (c) => c.name.startsWith('sb-') && c.name.includes('auth-token')
  );
}

/** Evita tormentas de 403: borra JWT inválido/caducado del browser. */
function clearSupabaseAuthCookies(req: NextRequest, res: NextResponse): void {
  const secure = process.env.NODE_ENV === 'production';
  for (const { name } of req.cookies.getAll()) {
    if (name.startsWith('sb-') && name.includes('auth-token')) {
      res.cookies.set(name, '', {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
      });
    }
  }
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
  if (!token) return false;
  // Vercel Cron envía `Authorization: Bearer <CRON_SECRET>`. No validar ese
  // valor contra Auth (genera 403 ruidosos en /auth/v1/user).
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && token === cronSecret) return false;
  return isValidSupabaseToken(token);
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

  // Sesión Supabase desde cookies (@supabase/ssr). Solo llamar a Auth si hay
  // cookie de sesión: sin cookie, getUser() genera 403 ruidosos en Edge/Vercel.
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  let sessionUser: { id: string } | null = null;
  /** true si Auth no respondió a tiempo pero hay cookie — no expulsar al login. */
  let authTimedOutWithCookie = false;
  const cookiePresent = hasSupabaseAuthCookie(req);

  if (SUPABASE_URL && SUPABASE_ANON_KEY && cookiePresent) {
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
      const { data, error } = await withTimeout(
        supabase.auth.getUser(),
        SUPABASE_AUTH_TIMEOUT_MS,
        { data: { user: null }, error: { message: 'auth_timeout' } as { message: string } },
      );
      if (data.user) {
        sessionUser = { id: data.user.id };
      } else if (error?.message === 'auth_timeout') {
        // Timeout de Supabase: NO limpiar cookies ni bloquear API (provocaba logout "de repente").
        authTimedOutWithCookie = true;
        sessionUser = null;
      } else {
        // Solo limpiar ante revocación clara. "refresh token" genérico suele ser
        // race de refresh paralelo y NO debe borrar cookies (expulsaba usuarios a mitad de proceso).
        const msg = (error?.message || '').toLowerCase();
        const definitive =
          msg.includes('session missing') ||
          msg.includes('refresh token not found') ||
          msg.includes('invalid refresh token') ||
          msg.includes('user from sub claim in jwt does not exist');
        if (definitive) {
          clearSupabaseAuthCookies(req, response);
        }
        sessionUser = null;
      }
    } catch {
      sessionUser = null;
    }
  }

  let rateLimit: RateLimitResult | null = null;

  if (pathname.startsWith('/api/') && !isPublicApiPath(pathname)) {
    // SEC-03: rate limiting por IP antes de cualquier trabajo costoso.
    const rl = enforceRateLimit(req, pathname);
    if (rl instanceof NextResponse) {
      fireHttpStatusSample(429, { source: 'middleware', path: pathname });
      return applyCorrelationHeaders(applySecurityHeaders(rl), correlationId);
    }
    rateLimit = rl;

    // SEC-01: sesión (cookies), cron interno, o Bearer JWT válido.
    // Cron ANTES de hasValidBearer: Vercel envía Bearer=<CRON_SECRET> y si se
    // valida primero contra Supabase Auth produce 403 en /auth/v1/user en cada tick.
    // Fail-open si Auth hizo timeout pero hay cookie: el handler valida con requireApiUser.
    const cronOk = isCronInternalPath(pathname) && isValidCronSecret(req);
    const authed =
      Boolean(sessionUser) ||
      cronOk ||
      authTimedOutWithCookie ||
      (await hasValidBearer(req));
    if (!authed) {
      fireHttpStatusSample(401, { source: 'middleware', path: pathname });
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
