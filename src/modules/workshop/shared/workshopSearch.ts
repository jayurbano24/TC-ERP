import { BATCH_LIMITS } from '@/shared/constants/batchLimits';

/** Limpia un token de búsqueda (evita comodines PostgREST en ilike). */
export function sanitizeWorkshopSearchToken(raw: string): string {
  return raw.replace(/[%,()*]/g, '').trim();
}

/**
 * Parte pegados masivos (saltos de línea, comas, espacios) en series únicas.
 * Tope: WORKSHOP_SEARCH_MAX_SERIALS (25).
 */
export function parseWorkshopSearchTokens(
  raw: string,
  max: number = BATCH_LIMITS.WORKSHOP_SEARCH_MAX_SERIALS
): { tokens: string[]; truncated: boolean; total: number } {
  const parts = String(raw || '')
    .split(/[\s,;]+/g)
    .map((t) => sanitizeWorkshopSearchToken(t).toUpperCase())
    .filter(Boolean);

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const t of parts) {
    if (seen.has(t)) continue;
    seen.add(t);
    unique.push(t);
  }

  return {
    tokens: unique.slice(0, Math.max(1, max)),
    truncated: unique.length > max,
    total: unique.length,
  };
}

/** Longitud máxima del query string `q` (25 series × ~64 chars + separadores). */
export const WORKSHOP_SEARCH_Q_MAX_CHARS = BATCH_LIMITS.WORKSHOP_SEARCH_MAX_SERIALS * 80;
