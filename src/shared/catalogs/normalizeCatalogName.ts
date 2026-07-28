/**
 * Normaliza nombres de catálogo (modelo/marca/tecnología):
 * espacios raros → espacio, colapsa espacios, trim.
 */
export function normalizeCatalogLabel(raw: string | null | undefined): string {
  if (raw == null) return '';
  return String(raw)
    .normalize('NFKC')
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clave estable para deduplicar opciones de filtro (case-insensitive). */
export function catalogLabelKey(raw: string | null | undefined): string {
  return normalizeCatalogLabel(raw).toUpperCase();
}
