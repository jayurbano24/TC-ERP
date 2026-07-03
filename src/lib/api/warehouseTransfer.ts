export type TransferResult = {
  success?: boolean;
  transferred?: number;
  total?: number;
  error?: string;
  results?: Array<{ boxId: string; ok: boolean; seriesCount?: number; error?: string }>;
};

export async function transferBoxesToWorkshopViaApi(boxIds: string[]): Promise<TransferResult> {
  const res = await fetch('/api/v1/warehouse/transfer-to-workshop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ boxIds, targetModule: 'taller' }),
  });

  const payload = (await res.json().catch(() => ({}))) as TransferResult;
  if (!res.ok) {
    return {
      success: false,
      error: payload.error ?? `HTTP ${res.status}`,
      results: payload.results,
    };
  }
  return { ...payload, success: true };
}
