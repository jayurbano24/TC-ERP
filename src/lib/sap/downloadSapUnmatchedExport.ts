import { apiFetch } from '@/lib/http/apiFetch';

/** Descarga Excel de equipos/series Sin Coincidencia (OS activas sin match SAP). */
export async function downloadSapUnmatchedExcel(): Promise<void> {
  const res = await apiFetch('/api/sap/unmatched?format=xlsx', { cache: 'no-store' });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Error HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sap-sin-coincidencia-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
