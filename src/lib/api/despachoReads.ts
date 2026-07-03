export type DespachoBoxListItem = {
  id: string;
  dbId: string;
  brand_id?: string;
  model_id?: string;
  destino: string;
  tipo: 'Master Box';
  unidades: number;
  estatus: 'Pendiente' | 'En Ruta';
  fecha: string;
};

export async function fetchDespachoBoxesViaApi(): Promise<DespachoBoxListItem[]> {
  const res = await fetch('/api/v1/despacho/boxes', { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return (data.items ?? []).map((b: any) => ({
    id: b.box_code,
    dbId: b.id,
    brand_id: b.brand_id,
    model_id: b.model_id,
    destino: 'Pendiente de asignar',
    tipo: 'Master Box' as const,
    unidades: b.capacity || 0,
    estatus: b.status === 'open' ? ('Pendiente' as const) : ('En Ruta' as const),
    fecha: new Date(b.created_at).toLocaleDateString(),
  }));
}

export type DespachoHistoryRow = {
  id: string;
  guide_number?: string;
  dispatch_type?: string;
  notes?: string;
  created_at?: string;
  dispatched_by?: string;
  dispatch_items?: Array<{ count: number }>;
};

export async function fetchDespachoHistoryViaApi(): Promise<DespachoHistoryRow[]> {
  const res = await fetch('/api/v1/despacho/history', { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return (data.items ?? []) as DespachoHistoryRow[];
}

export async function fetchDespachoPendientesViaApi(): Promise<any[]> {
  const res = await fetch('/api/v1/despacho/pendientes', { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return (data.items ?? []) as any[];
}
