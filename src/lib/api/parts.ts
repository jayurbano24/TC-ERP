import { apiFetch } from '@/lib/http/apiFetch';

async function readJson<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string; detail?: string }).error
      || (data as { detail?: string }).detail
      || `HTTP ${res.status}`);
  }
  return data as T;
}

export async function fetchPartsCatalog(params?: {
  q?: string;
  brandId?: string;
  modelId?: string;
  activeOnly?: boolean;
}) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set('q', params.q);
  if (params?.brandId) sp.set('brandId', params.brandId);
  if (params?.modelId) sp.set('modelId', params.modelId);
  if (params?.activeOnly === false) sp.set('activeOnly', '0');
  const res = await apiFetch(`/api/v1/parts/catalog?${sp}`, { credentials: 'include' });
  const data = await readJson<{ items: any[] }>(res);
  return data.items ?? [];
}

export async function savePartsCatalog(body: Record<string, unknown>) {
  const res = await apiFetch('/api/v1/parts/catalog', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson<{ item: any }>(res);
}

export async function fetchPartsInventory() {
  const res = await apiFetch('/api/v1/parts/inventory', { credentials: 'include' });
  const data = await readJson<{ items: any[] }>(res);
  return data.items ?? [];
}

export async function adjustPartsStock(body: {
  catalogId: string;
  qtyDelta: number;
  stockType?: 'NEW' | 'RECOVERED';
  notes?: string;
}) {
  const res = await apiFetch('/api/v1/parts/inventory', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

export async function updatePartsLocationApi(catalogId: string, location: string | null) {
  const res = await apiFetch('/api/v1/parts/inventory', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'location', catalogId, location }),
  });
  return readJson(res);
}

export async function deleteOrRequestPartApi(body: {
  catalogId: string;
  reason: string;
  observations?: string;
}) {
  const res = await apiFetch('/api/v1/parts/deletions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson<{
    mode: 'deleted' | 'authorization_required';
    message?: string;
    request?: any;
  }>(res);
}

export async function fetchPartDeletionRequests(status = 'pending') {
  const res = await apiFetch(`/api/v1/parts/deletions?status=${encodeURIComponent(status)}`, {
    credentials: 'include',
  });
  const data = await readJson<{ items: any[] }>(res);
  return data.items ?? [];
}

export async function reviewPartDeletionApi(
  requestId: string,
  decision: 'approve' | 'reject',
  reviewNotes?: string
) {
  const res = await apiFetch('/api/v1/parts/deletions', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, decision, reviewNotes }),
  });
  return readJson(res);
}

export async function fetchPartRequests(status?: string) {
  const sp = new URLSearchParams();
  if (status) sp.set('status', status);
  const res = await apiFetch(`/api/v1/parts/requests?${sp}`, { credentials: 'include' });
  const data = await readJson<{ items: any[] }>(res);
  return data.items ?? [];
}

export async function createPartRequestApi(body: Record<string, unknown>) {
  const res = await apiFetch('/api/v1/parts/requests', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sanitizePartRequestBody(body)),
  });
  return readJson(res);
}

export async function createPartRequestBatchApi(body: {
  catalogId: string;
  qtyPerOrder: number;
  priority: 'NORMAL' | 'URGENTE';
  reason?: string | null;
  notes?: string | null;
  orders: Array<{
    serviceOrderId: string;
    seriesId?: string | null;
    seriesIds?: string[];
    serialNumber?: string | null;
    serialNumbers?: string[];
    brandId?: string | null;
    modelId?: string | null;
  }>;
}) {
  const res = await apiFetch('/api/v1/parts/requests/batch', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson<{
    batch: { id: string; batch_number: string };
    created: Array<{ requestId: string; serviceOrderId: string }>;
    errors: Array<{ serviceOrderId: string; message: string }>;
  }>(res);
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function sanitizePartRequestBody(body: Record<string, unknown>) {
  const next = { ...body };
  if (!isUuid(next.brandId)) next.brandId = null;
  if (!isUuid(next.modelId)) next.modelId = null;
  if (!isUuid(next.seriesId)) next.seriesId = null;
  if (!isUuid(next.technicianId)) delete next.technicianId;
  return next;
}

export async function reservePartRequestItemApi(
  requestItemId: string,
  qty?: number,
  sourceType?: 'NEW' | 'RECOVERED'
) {
  const res = await apiFetch(`/api/v1/parts/request-items/${requestItemId}/reserve`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qty, sourceType }),
  });
  return readJson(res);
}

export async function dispatchPartRequestApi(requestId: string, notes?: string) {
  const res = await apiFetch(`/api/v1/parts/requests/${requestId}/dispatch`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  return readJson(res);
}

export async function dispatchPartRequestBatchApi(
  batchId: string,
  sourceType: 'NEW' | 'RECOVERED',
  notes?: string
) {
  const res = await apiFetch(`/api/v1/parts/batches/${batchId}/dispatch`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceType, notes }),
  });
  return readJson<{
    batchId: string;
    batchNumber: string;
    status: 'PARTIAL' | 'FULFILLED';
    dispatched: Array<{ requestId: string; dispatchId: string; serviceOrderId: string }>;
    errors: Array<{ requestId: string; serviceOrderId: string; message: string }>;
  }>(res);
}

export async function rejectPartRequestApi(requestId: string, reason?: string) {
  const res = await apiFetch(`/api/v1/parts/requests/${requestId}/reject`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return readJson(res);
}

export async function fetchPartDispatches() {
  const res = await apiFetch('/api/v1/parts/dispatches', { credentials: 'include' });
  const data = await readJson<{ items: any[] }>(res);
  return data.items ?? [];
}

export async function fetchPendingReturns() {
  const res = await apiFetch('/api/v1/parts/returns?pending=1', { credentials: 'include' });
  const data = await readJson<{ items: any[] }>(res);
  return data.items ?? [];
}

export async function fetchPartReturns() {
  const res = await apiFetch('/api/v1/parts/returns', { credentials: 'include' });
  const data = await readJson<{ items: any[] }>(res);
  return data.items ?? [];
}

export async function receivePartReturnApi(dispatchItemId: string, status?: string, notes?: string) {
  const res = await apiFetch('/api/v1/parts/returns', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dispatchItemId, status, notes }),
  });
  return readJson(res);
}

export async function fetchPurchaseOrders() {
  const res = await apiFetch('/api/v1/parts/purchases', { credentials: 'include' });
  const data = await readJson<{ items: any[] }>(res);
  return data.items ?? [];
}

export async function createPurchaseOrderApi(body: Record<string, unknown>) {
  const res = await apiFetch('/api/v1/parts/purchases', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

export async function receivePurchaseOrderApi(poId: string, notes?: string) {
  const res = await apiFetch(`/api/v1/parts/purchases/${poId}/receive`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notes }),
  });
  return readJson(res);
}

export async function fetchPartsAnalytics() {
  const res = await apiFetch('/api/v1/parts/analytics', { credentials: 'include' });
  return readJson<any>(res);
}

export async function fetchPartsMovements(params?: {
  q?: string;
  catalogId?: string;
  type?: string;
  limit?: number;
}) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set('q', params.q);
  if (params?.catalogId) sp.set('catalogId', params.catalogId);
  if (params?.type) sp.set('type', params.type);
  if (params?.limit) sp.set('limit', String(params.limit));
  const qs = sp.toString();
  const res = await apiFetch(`/api/v1/parts/movements${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
  });
  const data = await readJson<{ items: any[] }>(res);
  return data.items ?? [];
}

export async function fetchOsPartStatus(serviceOrderId: string) {
  const res = await apiFetch(`/api/v1/parts/os/${serviceOrderId}/status`, {
    credentials: 'include',
  });
  return readJson<any>(res);
}
