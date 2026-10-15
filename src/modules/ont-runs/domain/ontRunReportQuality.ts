import type { OntRun } from './types';
import { resolveCertSheetProfile } from './certificateSheetRows';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jsonArrayLen(root: Record<string, unknown> | null, path: string[]): number {
  if (!root) return 0;
  let cur: unknown = root;
  for (const key of path) {
    if (!isPlainObject(cur)) return 0;
    cur = cur[key];
  }
  return Array.isArray(cur) ? cur.length : 0;
}

export type OntRunReportQuality = {
  profile: 'ont' | 'emta';
  hasReportJson: boolean;
  hasCertificateSheet: boolean;
  paramRowCount: number;
  hasFlows: boolean;
  hasPorts: boolean;
  hasDsRows: boolean;
  hasUsRows: boolean;
  serialPresent: boolean;
  reportJsonBytes: number;
  /** true = el certificador envió certificate_sheet completo (LAB-002 típico). */
  labComplete: boolean;
  /** Mensaje corto para operador. */
  hint: string;
};

/** Evalúa si report_json trae datos suficientes para PDF tipo LAB o solo relleno ERP. */
export function assessOntRunReportQuality(run: OntRun): OntRunReportQuality {
  const report = run.reportJson && isPlainObject(run.reportJson) ? run.reportJson : null;
  const sheet = report && isPlainObject(report.certificate_sheet) ? report.certificate_sheet : null;
  const dut = report && isPlainObject(report.dut) ? report.dut : null;
  const profile = resolveCertSheetProfile(run, sheet ?? {});

  const cpeLen = jsonArrayLen(sheet, ['cpe_rows']);
  const rowsLen = jsonArrayLen(sheet, ['rows']);
  const paramRowCount = profile === 'ont' ? Math.max(cpeLen, rowsLen) : rowsLen;

  const dsInSheet = jsonArrayLen(sheet, ['ds_rows']);
  const dsInDut = dut && Array.isArray(dut.ds_rows) ? dut.ds_rows.length : 0;
  const usInSheet = jsonArrayLen(sheet, ['us_rows']);
  const usInDut = dut && Array.isArray(dut.us_rows) ? dut.us_rows.length : 0;

  const flowsLen = report && Array.isArray(report.flows) ? report.flows.length : 0;
  const portsLen = report && Array.isArray(report.ports) ? report.ports.length : 0;

  let reportJsonBytes = 0;
  if (report) {
    try {
      reportJsonBytes = JSON.stringify(report).length;
    } catch {
      reportJsonBytes = 0;
    }
  }

  const serialPresent = Boolean(
    run.serial?.trim() || (dut && String(dut.serial ?? '').trim()) || (sheet && String(sheet.serial ?? '').trim())
  );

  const hasCertificateSheet = sheet != null;
  const hasDsRows = dsInSheet + dsInDut > 0;
  const hasUsRows = usInSheet + usInDut > 0;

  const labCompleteOnt =
    profile === 'ont' &&
    (paramRowCount >= 8 || (flowsLen >= 1 && serialPresent && reportJsonBytes > 4000));
  const labCompleteEmta =
    profile === 'emta' &&
    (paramRowCount >= 6 || hasDsRows || hasUsRows || (flowsLen >= 1 && serialPresent));

  const labComplete = Boolean(report && (labCompleteOnt || labCompleteEmta));

  let hint: string;
  if (!report) {
    hint = 'Sin report_json — solo columnas planas; el PDF no puede reconstruir el certificado del lab.';
  } else if (labComplete) {
    hint = 'Payload del certificador completo.';
  } else if (hasCertificateSheet && paramRowCount <= 3) {
    hint = `certificate_sheet casi vacío (${paramRowCount} filas). Una de las PCs/staciones envió sync mínimo; alinear versión del certificador con LAB-002 y re-sincronizar.`;
  } else if (!hasCertificateSheet && reportJsonBytes < 2500) {
    hint = 'report_json muy pequeño y sin certificate_sheet — típico de certificador viejo o sync abortado.';
  } else if (!serialPresent) {
    hint = 'Falta número de serie en columnas y en dut/certificate_sheet — revisar script de sync en esa PC.';
  } else {
    hint = 'Datos parciales: el ERP rellena lo que puede; faltan bloques del certificador (flows, cpe_rows/rows, ds_rows).';
  }

  return {
    profile,
    hasReportJson: report != null,
    hasCertificateSheet,
    paramRowCount,
    hasFlows: flowsLen > 0,
    hasPorts: portsLen > 0,
    hasDsRows,
    hasUsRows,
    serialPresent,
    reportJsonBytes,
    labComplete,
    hint,
  };
}
