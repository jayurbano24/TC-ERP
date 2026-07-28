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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Huella de modelo (conserva guiones):
 * "CG-2000" / "CG 2000" / "KAON CG-2000" → CG-2000
 * "CG2000" → CG2000 (distinto; no colapsar con CG-2000)
 */
export function catalogModelKey(
  modelRaw: string | null | undefined,
  brandRaw?: string | null | undefined
): string {
  let label = normalizeCatalogLabel(modelRaw);
  if (!label) return '';

  const brand = normalizeCatalogLabel(brandRaw);
  if (brand) {
    const brandRe = new RegExp(`^${escapeRegExp(brand)}\\s*[-–—:/]?\\s*`, 'i');
    label = label.replace(brandRe, '').trim() || label;
  }

  return label
    .toUpperCase()
    // Espacio entre letra y dígito (o viceversa) → guion canónico
    .replace(/([A-Z])\s+(\d)/g, '$1-$2')
    .replace(/(\d)\s+([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Quita prefijo de marca del nombre de modelo para mostrar una sola etiqueta. */
export function stripBrandFromModelName(
  modelRaw: string | null | undefined,
  brandRaw?: string | null | undefined
): string {
  const label = normalizeCatalogLabel(modelRaw);
  if (!label) return '';
  const brand = normalizeCatalogLabel(brandRaw);
  if (!brand) return label;
  const brandRe = new RegExp(`^${escapeRegExp(brand)}\\s*[-–—:/]?\\s*`, 'i');
  const stripped = label.replace(brandRe, '').trim();
  return stripped || label;
}
