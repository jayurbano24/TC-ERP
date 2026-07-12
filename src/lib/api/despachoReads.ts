import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type DespachoBoxListItem = {
  id: string;
  dbId: string;
  brand_id?: string;
  model_id?: string;
  material?: string;
  valuation?: string;
  filled_count?: number;
  valorado_count?: number;
  novalorado_count?: number;
  series_preview?: string[];
  destino: string;
  tipo: 'Outbound';
  unidades: number;
  estatus: 'Pendiente' | 'En Ruta';
  fecha: string;
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

/**
 * Recalcula equipos/valoración por Outbound con el cliente browser
 * (misma visibilidad RLS que el llenado). Evita listar 0 equipos cuando la caja sí tiene series.
 */
export async function enrichOutboundFilledCounts<T extends DespachoBoxListItem>(
  items: T[]
): Promise<T[]> {
  if (!items.length) return items;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return items;

  const boxIds = items.map((b) => b.dbId).filter(Boolean);
  if (boxIds.length === 0) return items;

  const { data: seriesRows, error } = await supabase
    .from('series')
    .select('id, serial_number, current_box_id, material, valuation, service_order_id')
    .in('current_box_id', boxIds);

  if (error || !seriesRows) {
    console.warn('[despacho] enrichOutboundFilledCounts:', error?.message);
    return items;
  }

  type Acc = { valuation: string; serials: string[] };
  const groups = new Map<string, Acc>();

  for (const s of seriesRows) {
    const boxId = String(s.current_box_id);
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

  const stats = new Map<
    string,
    { filled_count: number; valorado_count: number; novalorado_count: number; series_preview: string[] }
  >();
  for (const id of boxIds) {
    stats.set(id, {
      filled_count: 0,
      valorado_count: 0,
      novalorado_count: 0,
      series_preview: [],
    });
  }

  for (const [gKey, acc] of groups) {
    const boxId = gKey.split('|')[0]!;
    const st = stats.get(boxId);
    if (!st) continue;
    st.filled_count += 1;
    const kind = classifyValuation(acc.valuation);
    if (kind === 'valorado') st.valorado_count += 1;
    if (kind === 'novalorado') st.novalorado_count += 1;
    const sapSn = acc.serials.find((sn) => looksLikeSapSn(sn)) || acc.serials[0];
    if (sapSn && st.series_preview.length < 6) st.series_preview.push(sapSn);
  }

  return items.map((b) => {
    const st = stats.get(b.dbId);
    if (!st) return b;
    return {
      ...b,
      filled_count: st.filled_count,
      valorado_count: st.valorado_count,
      novalorado_count: st.novalorado_count,
      series_preview: st.series_preview,
    };
  });
}

export async function fetchDespachoBoxesViaApi(): Promise<DespachoBoxListItem[]> {
  const res = await fetch('/api/v1/despacho/boxes', { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  const mapped = (data.items ?? []).map((b: any) => ({
    id: b.box_code,
    dbId: b.id,
    brand_id: b.brand_id,
    model_id: b.model_id,
    material: b.material ?? '',
    valuation: b.valuation ?? '',
    filled_count: Number(b.filled_count ?? 0),
    valorado_count: Number(b.valorado_count ?? 0),
    novalorado_count: Number(b.novalorado_count ?? 0),
    series_preview: Array.isArray(b.series_preview) ? b.series_preview : [],
    destino: 'Pendiente de asignar',
    tipo: 'Outbound' as const,
    unidades: b.capacity || 0,
    estatus: b.status === 'open' ? ('Pendiente' as const) : ('En Ruta' as const),
    fecha: new Date(b.created_at).toLocaleDateString(),
  }));

  return enrichOutboundFilledCounts(mapped);
}

export type DespachoHistoryRow = {
  id: string;
  guide_number?: string;
  dispatch_type?: string;
  notes?: string;
  /** Fecha de salida (columna real en DB; no existe created_at en dispatches). */
  dispatched_at?: string;
  /** Alias de compatibilidad UI. */
  created_at?: string;
  dispatched_by?: string;
  dispatched_by_name?: string;
  box_id?: string | null;
  box_code?: string | null;
  brand_id?: string | null;
  model_id?: string | null;
  material?: string | null;
  valuation?: string | null;
  capacity?: number | null;
  /** Equipos = OS distintas (no filas series hermanas). */
  equipos_count?: number;
  dispatch_items?: Array<{ count: number }>;
};

export type DespachoHistoryReprint = {
  dispatch: {
    id: string;
    guide_number?: string | null;
    notes?: string | null;
    dispatched_at?: string | null;
    traslado_sap?: string | null;
    nota_entrega?: string | null;
    destino?: string | null;
  };
  box: {
    id: string;
    box_code: string;
    brand_id?: string | null;
    model_id?: string | null;
    material?: string | null;
    valuation?: string | null;
    capacity?: number | null;
  } | null;
  items: Array<{
    id: string;
    serial_number?: string;
    s1: string;
    s2: string;
    s3: string;
    s4: string;
    material: string;
    valuation: string;
    brand_id?: string;
    model_id?: string;
    service_order_id?: string;
  }>;
  equipos_count: number;
};

export async function fetchDespachoHistoryViaApi(): Promise<DespachoHistoryRow[]> {
  const res = await fetch('/api/v1/despacho/history', { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return (data.items ?? []) as DespachoHistoryRow[];
}

export async function fetchDespachoHistoryReprint(dispatchId: string): Promise<DespachoHistoryReprint> {
  const res = await fetch(`/api/v1/despacho/history/${dispatchId}/reprint`, { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return data as DespachoHistoryReprint;
}

export async function fetchDespachoPendientesViaApi(): Promise<any[]> {
  const res = await fetch('/api/v1/despacho/pendientes', { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return (data.items ?? []) as any[];
}

/** Correlativo único OB-000001 vía RPC; fallback local si la migración 115 no está aplicada. */
export async function allocateOutboundCode(): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('Supabase no configurado');

  const { data, error } = await supabase.rpc('next_outbound_code');
  if (!error && data) return String(data);

  const { data: existingBoxes } = await supabase
    .from('boxes')
    .select('box_code')
    .or('box_code.ilike.OB-%,box_code.ilike.MB-%,box_code.ilike.CS-%');

  let nextNum = 1;
  for (const box of existingBoxes ?? []) {
    const match = String(box.box_code || '').match(/^(?:OB|MB|CS)-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= nextNum) nextNum = num + 1;
    }
  }
  return `OB-${nextNum.toString().padStart(6, '0')}`;
}

/** Correlativo único NS-000001 (Número de Salida / conduce); fallback si falta migración 116. */
export async function allocateSalidaCode(): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) throw new Error('Supabase no configurado');

  const { data, error } = await supabase.rpc('next_salida_code');
  if (!error && data) return String(data);

  const { data: existing } = await supabase
    .from('dispatches')
    .select('guide_number')
    .ilike('guide_number', 'NS-%');

  let nextNum = 1;
  for (const row of existing ?? []) {
    const match = String(row.guide_number || '').match(/^NS-(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num >= nextNum) nextNum = num + 1;
    }
  }
  return `NS-${nextNum.toString().padStart(6, '0')}`;
}
