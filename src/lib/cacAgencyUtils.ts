/** Courier ≠ Agencia CAC. Utilidades para no confundir carrier con agencia de ingreso. */

const COURIER_HINTS = [
  'cargo express',
  'cargo expreso',
  'guatex',
  'forza',
  'dhl',
  'fedex',
  'ups',
  'paquete express',
  'paquete',
  'courier',
  'logística',
  'logistica',
  'entrega directa',
  'transporte',
];

export function normalizeAgencyKey(value: string): string {
  return (value || '').trim().toLowerCase();
}

/** True si el texto corresponde al courier de la recepción o a un transportista conocido. */
export function isCourierLabel(name?: string | null, receptionCarrier?: string | null): boolean {
  if (!name?.trim()) return false;
  const n = normalizeAgencyKey(name);
  const carrier = normalizeAgencyKey(receptionCarrier || '');

  if (carrier && (n === carrier || carrier.includes(n) || n.includes(carrier))) {
    return true;
  }

  return COURIER_HINTS.some((hint) => n.includes(hint));
}

/**
 * Devuelve nombre de agencia CAC válido o cadena vacía si es courier / inválido.
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
  return matched ? matched.name : raw.trim();
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
