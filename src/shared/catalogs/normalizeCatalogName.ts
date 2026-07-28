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
 * Quita prefijo o sufijo de marca del nombre de modelo.
 * Ej: "KAON CG-2000" / "3.0 BC-RT905 BLUECASTLE" → etiqueta limpia.
 */
export function stripBrandFromModelName(
  modelRaw: string | null | undefined,
  brandRaw?: string | null | undefined
): string {
  let label = normalizeCatalogLabel(modelRaw);
  if (!label) return '';
  const brand = normalizeCatalogLabel(brandRaw);
  if (!brand) return label;

  const brandEsc = escapeRegExp(brand);
  const prefixRe = new RegExp(`^${brandEsc}\\s*[-–—:/]?\\s*`, 'i');
  const suffixRe = new RegExp(`\\s*[-–—:/]?\\s*${brandEsc}$`, 'i');

  let next = label.replace(prefixRe, '').trim();
  next = next.replace(suffixRe, '').trim();
  return next || label;
}

/**
 * Quita cualquier marca conocida que aparezca como prefijo/sufijo del modelo.
 */
export function stripKnownBrandsFromModelName(
  modelRaw: string | null | undefined,
  brandNames: Array<string | null | undefined>
): string {
  let label = normalizeCatalogLabel(modelRaw);
  if (!label) return '';

  const brands = [...new Set(
    brandNames
      .map((b) => normalizeCatalogLabel(b))
      .filter((b) => b.length >= 2)
  )].sort((a, b) => b.length - a.length);

  for (const brand of brands) {
    label = stripBrandFromModelName(label, brand);
  }
  return label;
}

/**
 * Huella de modelo (conserva guiones):
 * "CG-2000" / "CG 2000" / "KAON CG-2000" → CG-2000
 * "CG2000" → CG2000 (distinto)
 */
export function catalogModelKey(
  modelRaw: string | null | undefined,
  brandRaw?: string | null | undefined,
  extraBrands?: Array<string | null | undefined>
): string {
  let label = normalizeCatalogLabel(modelRaw);
  if (!label) return '';

  if (brandRaw) label = stripBrandFromModelName(label, brandRaw);
  if (extraBrands?.length) label = stripKnownBrandsFromModelName(label, extraBrands);

  return label
    .toUpperCase()
    .replace(/([A-Z])\s+(\d)/g, '$1-$2')
    .replace(/(\d)\s+([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
