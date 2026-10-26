/**
 * Sanitiza el query param `next` de /auth/confirm contra open-redirect.
 * Solo permite rutas relativas internas que empiezan con `/` y no con `//`.
 */
export function sanitizeAuthRedirect(
  next: string | null | undefined,
  fallback = '/auth/actualizar-password'
): string {
  const value = String(next ?? '').trim();
  if (!value.startsWith('/') || value.startsWith('//')) {
    return fallback;
  }
  // Bloquear esquemas embebidos / backslash tricks
  if (/^[\\/]*[a-z][a-z0-9+.-]*:/i.test(value) || value.includes('\\')) {
    return fallback;
  }
  return value;
}
