import { apiFetch } from '@/lib/http/apiFetch';
import { notify } from '@/components/ui';

/** Descarga Excel SAP (S1–S4) para una o más cajas outbound por UUID. */
export async function downloadOutboundBoxExcel(
  boxIds: string[],
  fileLabel: string,
  options?: { filePrefix?: string }
): Promise<void> {
  if (boxIds.length === 0) {
    notify.warning('No hay caja seleccionada para exportar.');
    return;
  }
  const url = new URL('/api/v1/warehouse/outbound-boxes/export', window.location.origin);
  url.searchParams.set('boxIds', boxIds.join(','));
  const res = await apiFetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Error HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const dl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = dl;
  const safe = fileLabel.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'outbound';
  const prefix = options?.filePrefix ?? 'Outbound';
  a.download = `${prefix}_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(dl);
}
