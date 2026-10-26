/**
 * Base URL para enlaces de invitación / recuperación en correos Auth.
 * Nunca prioriza localhost del navegador si existe una URL pública en env.
 */

export type AuthEmailRedirectResolution = {
  baseUrl: string;
  /** Destino post-confirmación (ruta relativa). */
  nextPath: string;
  /** URL completa que se pasa a invite/reset (aterriza en /auth/confirm). */
  redirectTo: string;
  isLocalhost: boolean;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

function isLocalhostUrl(url: string): boolean {
  try {
    const u = new URL(url.includes('://') ? url : `http://${url}`);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

export function resolveAuthEmailRedirect(redirectOrigin?: string): AuthEmailRedirectResolution {
  const envPublic =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL?.trim()
      ? `https://${process.env.VERCEL_URL.trim().replace(/^https?:\/\//, '')}`
      : '');

  const clientOrigin = redirectOrigin?.trim() || '';
  // Preferir siempre URL pública de entorno; ignorar localhost del browser.
  let base = envPublic || clientOrigin || 'http://localhost:3000';
  if (envPublic) {
    base = envPublic;
  } else if (clientOrigin && !isLocalhostUrl(clientOrigin)) {
    base = clientOrigin;
  }

  base = stripTrailingSlash(base);
  const nextPath = '/auth/actualizar-password';
  const redirectTo = `${base}/auth/confirm?next=${encodeURIComponent(nextPath)}`;
  const isLocalhost = isLocalhostUrl(base);
  // En desarrollo local permitimos localhost (mismo PC). En prod/móvil exige SITE_URL.
  const allowLocalDev =
    isLocalhost &&
    (process.env.NODE_ENV === 'development' ||
      process.env.ALLOW_LOCALHOST_AUTH_REDIRECT === 'true');

  return {
    baseUrl: base,
    nextPath,
    redirectTo,
    isLocalhost: isLocalhost && !allowLocalDev,
  };
}
