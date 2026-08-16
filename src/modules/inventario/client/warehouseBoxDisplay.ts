/** Códigos operativos estándar del ERP (correlativo global en bodega). */
const STANDARD_BOX_CODE = /^(BOX|MB)-[0-9]+$/i;
const SCRAP_BAD_BOX_CODE = /^BOX-BAD-[0-9]+$/i;

export function isStandardWarehouseBoxCode(code: string | null | undefined): boolean {
  return !!code && STANDARD_BOX_CODE.test(code.trim());
}

export function isScrapBadBoxCode(code: string | null | undefined): boolean {
  return !!code && SCRAP_BAD_BOX_CODE.test(code.trim());
}

/** Alias visual: BOX-45 → TCW-BOX-045 (mismo código en BD; solo presentación). */
export function toTcwBoxDisplayLabel(boxCode: string): string {
  const m = boxCode.trim().match(/^BOX-(\d+)$/i);
  if (m) return `TCW-BOX-${m[1].padStart(3, '0')}`;
  return boxCode;
}

/** Alias visual SCRAPS: BOX-BAD-1 → BOX-BAD-001 */
export function toScrapBadBoxDisplayLabel(boxCode: string): string {
  const m = boxCode.trim().match(/^BOX-BAD-(\d+)$/i);
  if (m) return `BOX-BAD-${m[1].padStart(3, '0')}`;
  return boxCode.trim().toUpperCase();
}

/**
 * Variantes de búsqueda para Consulta: la UI muestra TCW-BOX-045 pero en BD
 * suele guardarse BOX-45 / BOX-045. También BOX-BAD-001.
 */
export function expandBoxCodeSearchVariants(input: string): string[] {
  const raw = String(input || '').trim().toUpperCase();
  if (!raw) return [];

  const out = new Set<string>([raw]);
  if (raw.startsWith('TCW-')) out.add(raw.slice(4));

  const bad = raw.match(/^BOX-BAD-0*(\d+)$/i) || raw.match(/^TCW-BOX-BAD-0*(\d+)$/i);
  if (bad) {
    const n = String(parseInt(bad[1], 10));
    if (n && n !== 'NaN') {
      out.add(`BOX-BAD-${n}`);
      out.add(`BOX-BAD-${n.padStart(3, '0')}`);
      out.add(`BOX-BAD-${n.padStart(4, '0')}`);
    }
    return [...out].filter(Boolean);
  }

  const m =
    raw.match(/^TCW-(BOX|MB)-0*(\d+)$/i) ||
    raw.match(/^(BOX|MB)-0*(\d+)$/i);

  if (m) {
    const kind = m[1].toUpperCase();
    const n = String(parseInt(m[2], 10));
    if (n && n !== 'NaN') {
      out.add(`${kind}-${n}`);
      out.add(`${kind}-${n.padStart(3, '0')}`);
      out.add(`${kind}-${n.padStart(4, '0')}`);
      out.add(`TCW-${kind}-${n}`);
      out.add(`TCW-${kind}-${n.padStart(3, '0')}`);
    }
  }

  return [...out].filter(Boolean);
}

/**
 * Etiquetas libres de PX/AppSheet (ej. "31 PX ZONA 3, … TEL. KISI-D1001")
 * nunca pasaron por `next_box_code()` → no tienen correlativo BOX-XX / TCW-BOX-XXX.
 */
export function formatWarehouseBoxId(
  boxCode: string | null | undefined,
  boxUuid?: string
): { primary: string; full: string; isLegacy: boolean } {
  const full = (boxCode || '').trim();
  if (!full) {
    const fallback = boxUuid ? boxUuid.slice(0, 8) : '—';
    return { primary: fallback, full: fallback, isLegacy: false };
  }
  if (isScrapBadBoxCode(full)) {
    const display = toScrapBadBoxDisplayLabel(full);
    return { primary: display, full: display, isLegacy: false };
  }
  if (isStandardWarehouseBoxCode(full)) {
    const display = /^BOX-/i.test(full) ? toTcwBoxDisplayLabel(full) : full.toUpperCase();
    return { primary: display, full: display, isLegacy: false };
  }

  const segments = full.split(/[,|]/).map((s) => s.trim()).filter(Boolean);
  const tail = segments[segments.length - 1] || full;
  const primary = tail.length > 28 ? `${tail.slice(0, 26)}…` : tail;
  return { primary, full, isLegacy: true };
}
