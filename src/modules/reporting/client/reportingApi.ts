import { isCentralReportingEnabledClient } from '../infrastructure/feature-flags';
import type { ExportFormat, ReportFilterParams } from '../domain/types/report.types';
import { apiFetch } from '@/lib/http/apiFetch';

export async function fetchReportCatalogApi() {
  const res = await apiFetch('/api/reports/catalog', { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error al cargar catálogo');
  return json.reports as Array<{
    code: string;
    name: string;
    category: string;
    description: string | null;
    columns: string[];
    requiresDateRange: boolean;
  }>;
}

export async function downloadReportApi(
  code: string,
  filters: ReportFilterParams,
  format: ExportFormat = 'XLSX'
) {
  const res = await apiFetch(`/api/reports/${encodeURIComponent(code)}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, filters }),
  });

  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || 'Error al generar reporte');
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] || `${code}.${format === 'CSV' ? 'csv' : 'xlsx'}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { isCentralReportingEnabledClient };
