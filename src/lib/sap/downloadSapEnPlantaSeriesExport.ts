import { apiFetch } from '@/lib/http/apiFetch';

/** Excel con todas las series de OS en planta (base KPI En planta). */
export async function downloadSapEnPlantaSeriesExcel(): Promise<void> {
  const res = await apiFetch('/api/sap/en-planta-series?format=xlsx', { cache: 'no-store' });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `Error HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `sap-series-en-planta-${new Date().toISOString().slice(0, 10)}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
