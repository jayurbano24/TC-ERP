/**
 * Arma S1–S4 por equipo (misma OS), alineado con despacho/reprint y cruce SAP.
 */

export type SerialPickRow = {
  id: string;
  serial_number: string | null;
  material?: string | null;
  valuation?: string | null;
  created_at?: string | null;
  s2?: string | null;
  s3?: string | null;
  s4?: string | null;
};

export function looksLikeSapSn(sn: string): boolean {
  return /^\d{12,}$/.test(sn.trim());
}

export function looksLikeMac(sn: string): boolean {
  const s = sn.trim();
  return /^[0-9A-Fa-f]{12}$/.test(s) && /[A-Fa-f]/.test(s);
}

export function pickSapPrimarySerial(
  sibs: SerialPickRow[],
  mainSerial?: string | null
): SerialPickRow {
  if (!sibs.length) throw new Error('pickSapPrimarySerial: empty');
  const norm = (s: string) => s.trim().toUpperCase();
  const main = mainSerial?.trim() || '';
  if (main && looksLikeSapSn(main)) {
    const hit = sibs.find((s) => norm(String(s.serial_number || '')) === norm(main));
    if (hit) return hit;
  }
  const score = (s: SerialPickRow) => {
    const sn = String(s.serial_number || '');
    let n = 0;
    if (looksLikeSapSn(sn)) n += 100;
    if (looksLikeMac(sn)) n -= 50;
    if (main && norm(sn) === norm(main)) n += 15;
    if (String(s.material ?? '').trim()) n += 30;
    if (String(s.valuation ?? '').trim()) n += 10;
    return n;
  };
  return [...sibs].sort((a, b) => score(b) - score(a))[0]!;
}

export function coalesceMaterialLote(
  rows: Array<{ material?: string | null; valuation?: string | null }>
): { material: string; valuation: string } {
  let material = '';
  let valuation = '';
  for (const s of rows) {
    const m = String(s.material ?? '').trim();
    const v = String(s.valuation ?? '').trim();
    if (!material && m) material = m;
    if (!valuation && v) valuation = v;
    if (material && valuation) break;
  }
  return { material, valuation };
}

/** Una fila horizontal S1–S4 por equipo (hermanas de la OS + columnas s2–s4 legacy). */
export function buildEquipmentSerialSlots(
  group: SerialPickRow[],
  mainSerial?: string | null
): { s1: string; s2: string; s3: string; s4: string; primary: SerialPickRow } {
  if (group.length === 0) {
    throw new Error('buildEquipmentSerialSlots: empty group');
  }

  const primary = pickSapPrimarySerial(group, mainSerial);
  const rest = group
    .filter((s) => s.id !== primary.id)
    .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));

  const merged: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined) => {
    const sn = String(raw || '').trim();
    if (!sn) return;
    const k = sn.toUpperCase();
    if (seen.has(k)) return;
    seen.add(k);
    merged.push(sn);
  };

  push(primary.serial_number);
  for (const s of rest) push(s.serial_number);
  push(primary.s2);
  push(primary.s3);
  push(primary.s4);

  const main = mainSerial?.trim();
  if (main) {
    const idx = merged.findIndex((sn) => sn.toUpperCase() === main.toUpperCase());
    if (idx > 0) {
      const [first] = merged.splice(idx, 1);
      merged.unshift(first);
    }
  }

  const sapIdx = merged.findIndex((sn) => looksLikeSapSn(sn));
  if (sapIdx > 0) {
    const [sap] = merged.splice(sapIdx, 1);
    merged.unshift(sap);
  }

  return {
    s1: merged[0] || '',
    s2: merged[1] || '',
    s3: merged[2] || '',
    s4: merged[3] || '',
    primary,
  };
}
