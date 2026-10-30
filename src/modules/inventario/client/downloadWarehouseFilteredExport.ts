import { apiFetch, haltForLoginRedirect, isApiAuthFailure } from '@/lib/http/apiFetch';
import { notify } from '@/components/ui';

export type WarehouseFilteredExportParams = {
  search?: string;
  fillStatus?: string;
  technologyId?: string;
  modelId?: string;
};

export type WarehouseExportMode = 'boxes' | 'boxes-with-series-etl';

function applyFilters(url: URL, params: WarehouseFilteredExportParams): void {
  if (params.search) url.searchParams.set('search', params.search);
  if (params.fillStatus) url.searchParams.set('fillStatus', params.fillStatus);
  if (params.technologyId) url.searchParams.set('technologyId', params.technologyId);
  if (params.modelId) url.searchParams.set('modelId', params.modelId);
}

function triggerDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const m = /filename="([^"]+)"/i.exec(header);
  return m?.[1] || fallback;
}

async function downloadOne(
  url: URL,
  fallbackName: string
): Promise<{
  ok: boolean;
  status: number;
  headers: Headers;
  error?: string;
  detail?: string;
}> {
  const res = await apiFetch(url.toString());
  if (isApiAuthFailure(res.status, null)) {
    await haltForLoginRedirect();
    return { ok: false, status: res.status, headers: res.headers, error: 'AUTH' };
  }
  if (!res.ok) {
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    return {
      ok: false,
      status: res.status,
      headers: res.headers,
      error: payload.error || `HTTP ${res.status}`,
      detail: payload.detail,
    };
  }
  const blob = await res.blob();
  const name = filenameFromDisposition(
    res.headers.get('Content-Disposition'),
    fallbackName
  );
  triggerDownload(blob, name);
  return { ok: true, status: res.status, headers: res.headers };
}

/**
 * - boxes: Excel solo cajas.
 * - boxes-with-series-etl: un solo Excel (hojas Detalle Cajas + Series) vía ETL interno.
 */
export async function downloadWarehouseFilteredExport(
  params: WarehouseFilteredExportParams & { mode: WarehouseExportMode }
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const url = new URL('/api/v1/warehouse/boxes/export', window.location.origin);
  applyFilters(url, params);

  if (params.mode === 'boxes') {
    url.searchParams.set('kind', 'boxes');
    const res = await downloadOne(url, `Reporte_Cajas_${today}.xlsx`);
    if (!res.ok) {
      if (res.error === 'AUTH') return;
      notify.error(res.error || 'Error exportando cajas', { description: res.detail });
      return;
    }
    notify.success('Solo cajas descargadas', {
      description: `${res.headers.get('X-Export-Boxes') || '?'} caja(s) · Excel`,
    });
    return;
  }

  url.searchParams.set('kind', 'boxes-series-etl');
  notify.info('ETL Excel en curso…', {
    description:
      'El servidor lee series por fases y arma un solo .xlsx (Cajas + Series). Espere sin recargar.',
  });

  const res = await downloadOne(url, `Reporte_Cajas_y_Series_ETL_${today}.xlsx`);
  if (!res.ok) {
    if (res.error === 'AUTH') return;
    notify.error(res.error || 'Error en ETL Excel', { description: res.detail });
    return;
  }

  notify.success('Excel cajas + series listo', {
    description: [
      `${res.headers.get('X-Export-Boxes') || '?'} caja(s)`,
      `${res.headers.get('X-Export-Series') || '?'} equipo(s)`,
      `${res.headers.get('X-Export-Phases') || '?'} fase(s)`,
    ].join(' · '),
  });
}
