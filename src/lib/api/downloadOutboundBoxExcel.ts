import { apiFetch } from '@/lib/http/apiFetch';
import { notify } from '@/components/ui';

/** Tope alineado al API: un solo Excel con ETL/fases internas en servidor. */
export const OUTBOUND_EXCEL_MAX_TOTAL = 1000;

/** @deprecated Alias del tope único; ya no se parten archivos. */
export const OUTBOUND_EXCEL_PHASE_SIZE = OUTBOUND_EXCEL_MAX_TOTAL;
export const OUTBOUND_EXCEL_MAX_BOXES = OUTBOUND_EXCEL_MAX_TOTAL;

type ExportErrorBody = {
  error?: string;
  detail?: string;
  issues?: unknown;
};

/**
 * Descarga un único Excel SAP (S1–S4) con todas las cajas pedidas.
 * El servidor procesa por fases internas; el navegador recibe un solo .xlsx.
 */
export async function downloadOutboundBoxExcel(
  boxIds: string[],
  fileLabel: string,
  options?: {
    filePrefix?: string;
    onPhase?: (phase: number, totalPhases: number, phaseSize: number) => void;
  }
): Promise<{ files: number; boxes: number }> {
  const uniqueIds = [...new Set(boxIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (uniqueIds.length === 0) {
    notify.warning('No hay caja seleccionada para exportar.');
    return { files: 0, boxes: 0 };
  }
  if (uniqueIds.length > OUTBOUND_EXCEL_MAX_TOTAL) {
    throw new Error(
      `Máximo ${OUTBOUND_EXCEL_MAX_TOTAL} cajas por Excel. Reduzca el rango o selección.`
    );
  }

  options?.onPhase?.(1, 1, uniqueIds.length);

  const res = await apiFetch('/api/v1/warehouse/outbound-boxes/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ boxIds: uniqueIds }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as ExportErrorBody;
    throw new Error(err.detail || err.error || `Error HTTP ${res.status}`);
  }
  const blob = await res.blob();
  const dl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = dl;
  const safe = fileLabel.replace(/[^\w.-]+/g, '_').slice(0, 80) || 'outbound';
  const prefix = options?.filePrefix ?? 'Outbound';
  a.download = `${prefix}_${safe}_${uniqueIds.length}cajas_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(dl);

  return { files: 1, boxes: uniqueIds.length };
}

/** Extrae el correlativo numérico de OB-000032 / 32 / OB-32. */
export function parseOutboundCodeNumber(raw: string): number | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const m = s.match(/^(?:OB-)?0*(\d+)$/i);
  if (!m) return null;
  const n = Number.parseInt(m[1]!, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatOutboundCode(n: number): string {
  return `OB-${String(n).padStart(6, '0')}`;
}
