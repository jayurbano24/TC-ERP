/** Courier ≠ Agencia CAC. Utilidades para no confundir carrier con agencia de ingreso. */

/**
 * Transportistas conocidos. Nunca deben usarse como Agencia CAC / Origen.
 * Incluye variantes frecuentes de Cargo Express.
 */
const COURIER_HINTS = [
  'cargo express',
  'cargo expreso',
  'cargoexpress',
  'cargo-express',
  'cargo_express',
  'c express',
  'guatex',
  'forza',
  'dhl',
  'fedex',
  'ups',
  'paquete express',
  'paquete expreso',
  'paqueteexpress',
  'courier',
  'logistica',
  'entrega directa',
  'transporte',
] as const;

export function normalizeAgencyKey(value: string): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_./\\-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Compacta el texto (sin espacios) para detectar "CargoExpress" / "CARGO-EXPRESS". */
function compactAgencyKey(value: string): string {
  return normalizeAgencyKey(value).replace(/\s+/g, '');
}

/** True si el texto corresponde al courier de la recepción o a un transportista conocido. */
export function isCourierLabel(name?: string | null, receptionCarrier?: string | null): boolean {
  if (!name?.trim()) return false;
  const n = normalizeAgencyKey(name);
  const compact = compactAgencyKey(name);
  const carrier = normalizeAgencyKey(receptionCarrier || '');
  const carrierCompact = compactAgencyKey(receptionCarrier || '');

  if (
    carrier &&
    (n === carrier || carrier.includes(n) || n.includes(carrier) || compact === carrierCompact)
  ) {
    return true;
  }

  return COURIER_HINTS.some((hint) => {
    const h = normalizeAgencyKey(hint);
    const hc = compactAgencyKey(hint);
    return n.includes(h) || compact.includes(hc) || compact === hc;
  });
}

/**
 * Devuelve nombre de agencia CAC válido o cadena vacía si es courier / inválido.
 * Cargo Express y demás couriers siempre se rechazan (no son agencias).
 */
export function sanitizeCacAgencyRaw(
  raw?: string | null,
  receptionCarrier?: string | null,
  agencies: { id: string; name: string }[] = []
): string {
  if (!raw?.trim()) return '';
  if (isCourierLabel(raw, receptionCarrier)) return '';

  const matched = agencies.find(
    (a) =>
      a.name.toUpperCase() === raw.toUpperCase() ||
      a.id.toUpperCase() === raw.toUpperCase()
  );

  // Si el catálogo tuviera mal cargado un courier como "agencia", también se excluye.
  if (matched && isCourierLabel(matched.name)) return '';
  if (matched && isCourierLabel(matched.id)) return '';

  return matched ? matched.name : raw.trim();
}

/** Filtra del catálogo CAC cualquier fila que sea courier (p. ej. Cargo Express). */
export function filterCacAgenciesOnly<T extends { id?: string; name?: string; code?: string }>(
  agencies: T[]
): T[] {
  return agencies.filter((a) => {
    const label = a.name || a.code || a.id || '';
    return !isCourierLabel(label);
  });
}

export function resolveCacAgencyDisplay(
  raw: string,
  agencies: { id: string; name: string }[] = [],
  receptionCarrier?: string | null
): string {
  const clean = sanitizeCacAgencyRaw(raw, receptionCarrier, agencies);
  if (!clean) return '---';
  const matched = agencies.find(
    (a) =>
      a.name.toUpperCase() === clean.toUpperCase() ||
      a.id.toUpperCase() === clean.toUpperCase()
  );
  return matched ? `${matched.id} — ${matched.name}` : clean;
}
