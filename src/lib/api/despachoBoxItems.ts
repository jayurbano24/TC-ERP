export type DespachoBoxItem = {
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
};

export async function fetchDespachoBoxItems(boxDbId: string): Promise<DespachoBoxItem[]> {
  const res = await fetch(`/api/v1/despacho/boxes/${boxDbId}/items`, { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return (data.items ?? []) as DespachoBoxItem[];
}
