import type { SupabaseClient } from '@supabase/supabase-js';
import { countOutboundEquipmentsLikeDetail } from '@/lib/api/outboundBoxEquipmentCount';
import { fetchSiblingIdsByServiceOrder } from '@/lib/api/outboundBoxSiblingIds';

export type OutboundBoxSeriesStats = {
  filled_count: number;
  valorado_count: number;
  novalorado_count: number;
  series_preview: string[];
};

function classifyValuation(raw: unknown): 'valorado' | 'novalorado' | 'otro' {
  const s = String(raw ?? '').trim();
  if (!s) return 'otro';
  if (/novalorad|no\s*valorad/i.test(s)) return 'novalorado';
  if (/valorado/i.test(s)) return 'valorado';
  return 'otro';
}

function looksLikeSapSn(sn: string): boolean {
  return /^\d{12,}$/.test(sn.trim());
}

type SeriesPick = {
  id: string;
  serial_number: string | null;
  current_box_id: string | null;
  material: string | null;
  valuation: string | null;
  service_order_id: string | null;
  updated_at: string | null;
};

const SERIES_PAGE = 1000;

/**
 * Cuenta equipos (OS) por caja outbound. Pagina series para no truncar en 1000 filas PostgREST.
 */
export async function aggregateOutboundBoxSeriesStats(
  supabase: SupabaseClient,
  boxIds: string[]
): Promise<Map<string, OutboundBoxSeriesStats>> {
  const statsByBox = new Map<string, OutboundBoxSeriesStats>();
  for (const id of boxIds) {
    statsByBox.set(id, {
      filled_count: 0,
      valorado_count: 0,
      novalorado_count: 0,
      series_preview: [],
    });
  }
  if (boxIds.length === 0) return statsByBox;

  type Acc = { valuation: string; serials: string[] };
  const groups = new Map<string, Acc>();
  const rowsByBox = new Map<string, SeriesPick[]>();
  for (const id of boxIds) rowsByBox.set(id, []);

  let cursorId: string | undefined;
  for (let guard = 0; guard < 500; guard += 1) {
    let q = supabase
      .from('series')
      .select('id, serial_number, current_box_id, material, valuation, service_order_id, updated_at')
      .in('current_box_id', boxIds)
      .order('id', { ascending: true })
      .limit(SERIES_PAGE + 1);

    if (cursorId) q = q.gt('id', cursorId);

    const { data, error } = await q;
    if (error) throw error;

    const chunk = (data ?? []) as SeriesPick[];
    if (chunk.length === 0) break;

    const hasMore = chunk.length > SERIES_PAGE;
    const page = hasMore ? chunk.slice(0, SERIES_PAGE) : chunk;

    for (const s of page) {
      const boxId = String(s.current_box_id);
      if (!statsByBox.has(boxId)) continue;
      rowsByBox.get(boxId)!.push(s);
      const osKey = s.service_order_id ? String(s.service_order_id) : `solo:${s.id}`;
      const gKey = `${boxId}|${osKey}`;
      let acc = groups.get(gKey);
      if (!acc) {
        acc = { valuation: '', serials: [] };
        groups.set(gKey, acc);
      }
      const v = String(s.valuation ?? '').trim();
      if (!acc.valuation && v) acc.valuation = v;
      const sn = String(s.serial_number || '').trim();
      if (sn) acc.serials.push(sn);
    }

    cursorId = page[page.length - 1]?.id;
    if (!hasMore) break;
  }

  for (const [gKey, acc] of groups) {
    const boxId = gKey.split('|')[0]!;
    const stats = statsByBox.get(boxId);
    if (!stats) continue;
    const kind = classifyValuation(acc.valuation);
    if (kind === 'valorado') stats.valorado_count += 1;
    if (kind === 'novalorado') stats.novalorado_count += 1;
    const sapSn = acc.serials.find((sn) => looksLikeSapSn(sn)) || acc.serials[0];
    if (sapSn && stats.series_preview.length < 6) stats.series_preview.push(sapSn);
  }

  const allOsIds: string[] = [];
  for (const boxRows of rowsByBox.values()) {
    for (const r of boxRows) {
      if (r.service_order_id) allOsIds.push(String(r.service_order_id));
    }
  }
  const siblingIdsByOs = await fetchSiblingIdsByServiceOrder(supabase, allOsIds);

  for (const [boxId, boxRows] of rowsByBox) {
    const stats = statsByBox.get(boxId);
    if (!stats) continue;
    stats.filled_count = countOutboundEquipmentsLikeDetail(boxRows, siblingIdsByOs);
  }

  return statsByBox;
}
