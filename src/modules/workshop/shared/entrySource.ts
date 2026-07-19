export type EntrySource = 'cac' | 'px';
export type EntrySourceLabel = 'CAC' | 'PX';

function asReception(value: unknown): { source?: string | null; guide_number?: string | null } | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === 'object'
      ? (first as { source?: string | null; guide_number?: string | null })
      : null;
  }
  if (typeof value === 'object') {
    return value as { source?: string | null; guide_number?: string | null };
  }
  return null;
}

/** Normaliza cac|px desde texto libre (PX, cac, "PX – ZONA 3", etc.). */
export function normalizeEntrySource(raw: unknown): EntrySource | null {
  const text = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!text || text === '—' || text === '-' || text === 'sin dato') return null;
  if (text === 'cac' || text === 'px') return text;
  const match = text.match(/\b(cac|px)\b/);
  return match ? (match[1] as EntrySource) : null;
}

export function entrySourceLabel(source: EntrySource | null | undefined): EntrySourceLabel | null {
  if (source === 'cac') return 'CAC';
  if (source === 'px') return 'PX';
  return null;
}

/** Mayoría de un mapa serie → origen. */
export function majorityEntrySource(
  map: Record<string, string> | null | undefined
): EntrySource | null {
  let cac = 0;
  let px = 0;
  for (const value of Object.values(map || {})) {
    const src = normalizeEntrySource(value);
    if (src === 'cac') cac += 1;
    if (src === 'px') px += 1;
  }
  if (cac === 0 && px === 0) return null;
  return px >= cac ? 'px' : 'cac';
}

/**
 * Resuelve origen de ingreso para una fila de taller / detalle.
 * Orden: series.entry_source → receptions.source → mapa por serie → guía REC-*.
 */
export function resolveEntrySource(input: {
  entry_source?: unknown;
  receptions?: unknown;
  series_entry_map?: Record<string, string> | null;
  guide?: unknown;
  serial?: unknown;
}): EntrySource | null {
  const fromSeries = normalizeEntrySource(input.entry_source);
  if (fromSeries) return fromSeries;

  const reception = asReception(input.receptions);
  const fromReception = normalizeEntrySource(reception?.source);
  if (fromReception) return fromReception;

  if (input.serial) {
    const fromMapSn = normalizeEntrySource(input.series_entry_map?.[String(input.serial)]);
    if (fromMapSn) return fromMapSn;
  }

  const fromMap = majorityEntrySource(input.series_entry_map);
  if (fromMap) return fromMap;

  const guide = String(input.guide || reception?.guide_number || '').trim().toUpperCase();
  if (guide.startsWith('REC-')) return 'px';

  return null;
}
