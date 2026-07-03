import { apiFetch } from '@/lib/http/apiFetch';

export async function fetchPxPrintData(receptionId: string) {
  const res = await apiFetch(`/api/recepcion/px/${receptionId}/print-data`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al cargar datos de impresión');
  return json.data as {
    boxes: any[];
    equipments: any[];
  };
}

export async function fetchCacGuideSerials(receptionId: string) {
  const res = await apiFetch(`/api/recepcion/cac/${receptionId}/serials`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al cargar guías');
  return json.data as string[];
}

export async function fetchCacReceptionGuides(receptionIds: string[]) {
  if (receptionIds.length === 0) return [];
  const res = await apiFetch(
    `/api/recepcion/cac/guides?receptionIds=${encodeURIComponent(receptionIds.join(','))}`,
  );
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al cargar guías CAC');
  return json.data as any[];
}

export async function fetchReceptionHistoryKpis() {
  const res = await apiFetch('/api/recepcion/history/kpis');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al cargar KPIs');
  return json.data as { guiasHoy: number; equiposHoy: number; enEspera: number };
}

export async function patchReceptionSap(receptionId: string, sapDocument: string) {
  const res = await apiFetch(`/api/recepcion/${receptionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sapDocument }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al actualizar SAP');
}

export async function patchReceptionWarehouseDelete(receptionId: string) {
  const res = await apiFetch(`/api/recepcion/${receptionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'ELIMINADO POR BODEGA' }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Error al eliminar recepción');
}

export async function lookupReceptionSerial(serial: string) {
  const res = await apiFetch(
    `/api/recepcion/series/lookup?serial=${encodeURIComponent(serial)}`,
  );
  const json = await res.json();
  if (!json.success) return null;
  return json.data;
}

export async function fetchLatestServiceOrder(seriesId: string, mainSerial?: string) {
  const params = new URLSearchParams({ seriesId });
  if (mainSerial) params.set('mainSerial', mainSerial);
  const res = await apiFetch(`/api/recepcion/service-orders/latest?${params}`);
  const json = await res.json();
  if (!json.success) return null;
  return json.data;
}
