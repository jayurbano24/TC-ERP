import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { aggregateOutboundBoxSeriesStats } from '@/lib/api/aggregateOutboundBoxSeriesStats';
import { apiFetch } from '@/lib/http/apiFetch';

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

/**
 * Recalcula equipos/valoración por Outbound con el cliente browser
 * (misma visibilidad RLS que el llenado). Pagina series para evitar truncar en 1000 filas.
 */
export async function enrichOutboundFilledCounts<T extends DespachoBoxListItem>(
  items: T[]
): Promise<T[]> {
  if (!items.length) return items;
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return items;

  const boxIds = items.map((b) => b.dbId).filter(Boolean);
  if (boxIds.length === 0) return items;

  let stats: Map<
    string,
    { filled_count: number; valorado_count: number; novalorado_count: number; series_preview: string[] }
  >;
  try {
    stats = await aggregateOutboundBoxSeriesStats(supabase, boxIds);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[despacho] enrichOutboundFilledCounts:', message);
    return items;
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

function mapApiBox(b: Record<string, unknown>): DespachoBoxListItem {
  return {
    id: String(b.box_code),
    dbId: String(b.id),
    brand_id: b.brand_id as string | undefined,
    model_id: b.model_id as string | undefined,
    material: String(b.material ?? ''),
    valuation: String(b.valuation ?? ''),
    filled_count: Number(b.filled_count ?? 0),
    valorado_count: Number(b.valorado_count ?? 0),
    novalorado_count: Number(b.novalorado_count ?? 0),
    series_preview: Array.isArray(b.series_preview) ? (b.series_preview as string[]) : [],
    destino: 'Pendiente de asignar',
    tipo: 'Outbound' as const,
    unidades: Number(b.capacity) || 0,
    estatus: b.status === 'open' ? ('Pendiente' as const) : ('En Ruta' as const),
    fecha: new Date(String(b.created_at)).toLocaleDateString(),
  };
}

function dedupeByDbId(items: DespachoBoxListItem[]): DespachoBoxListItem[] {
  const seen = new Set<string>();
  const out: DespachoBoxListItem[] = [];
  for (const item of items) {
    if (!item.dbId || seen.has(item.dbId)) continue;
    seen.add(item.dbId);
    out.push(item);
  }
  return out;
}

export async function fetchDespachoBoxesViaApi(): Promise<DespachoBoxListItem[]> {
  const allMapped: DespachoBoxListItem[] = [];
  let cursor: string | undefined;

  for (let guard = 0; guard < 100; guard += 1) {
    const params = new URLSearchParams({ limit: '100' });
    if (cursor) params.set('cursor', cursor);
    const res = await apiFetch(`/api/v1/despacho/boxes?${params}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
    }
    const items = (data.items ?? []) as Record<string, unknown>[];
    allMapped.push(...items.map(mapApiBox));
    const nextCursor = data.nextCursor as string | null | undefined;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return dedupeByDbId(allMapped);
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
  /** Seriales del despacho (para búsqueda en historial). */
  series_numbers?: string[];
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
  const res = await apiFetch('/api/v1/despacho/history');
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return (data.items ?? []) as DespachoHistoryRow[];
}

export async function fetchDespachoHistoryReprint(dispatchId: string): Promise<DespachoHistoryReprint> {
  const res = await apiFetch(`/api/v1/despacho/history/${dispatchId}/reprint`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return data as DespachoHistoryReprint;
}

export type DespachoHistoryGuideDetail = {
  guide_number: string;
  notes?: string | null;
  dispatch_type?: string | null;
  dispatched_at?: string | null;
  dispatched_by?: string | null;
  dispatched_by_name?: string;
  box_count: number;
  equipos_total: number;
  boxes: Array<{
    dispatch_id: string;
    box_id: string | null;
    box_code: string | null;
    brand_id: string | null;
    model_id: string | null;
    material: string | null;
    valuation: string | null;
    capacity: number | null;
    status: string | null;
    equipos_count: number;
    dispatched_at: string | null;
    series_numbers: string[];
    series_preview: string[];
  }>;
};

export async function fetchDespachoHistoryByGuide(
  guideNumber: string
): Promise<DespachoHistoryGuideDetail> {
  const encoded = encodeURIComponent(guideNumber.trim());
  const res = await apiFetch(`/api/v1/despacho/history/by-guide/${encoded}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail ?? data.error ?? `HTTP ${res.status}`);
  }
  return data as DespachoHistoryGuideDetail;
}

export async function fetchDespachoPendientesViaApi(): Promise<any[]> {
  const res = await apiFetch('/api/v1/despacho/pendientes');
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
