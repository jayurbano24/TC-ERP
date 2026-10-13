'use client';

import type { OntRun } from '../domain/types';
import { renderCertifierReportHtml, escapeHtml } from './certifierReportHtml';
import { fetchOntRunByRunId } from './ontRunsApi';

function display(value: string): string {
  const v = value.trim();
  return v || '—';
}

function formatRecordedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('es-GT', { dateStyle: 'medium', timeStyle: 'medium' });
}

function renderLegacyFlatReport(run: OntRun): string {
  const verdict = run.verdict.toUpperCase();
  const verdictColor = verdict === 'PASS' ? '#059669' : verdict === 'FAIL' ? '#dc2626' : '#64748b';

  const throughputRows =
    run.throughput.length === 0
      ? `<tr><td colspan="5" style="padding:12px;text-align:center;color:#64748b;">Sin pruebas de throughput</td></tr>`
      : run.throughput
          .map(
            (row) => `<tr>
      <td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(row.kind || '—')}</td>
      <td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(row.source || '—')}</td>
      <td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(row.destination || '—')}</td>
      <td style="padding:8px;border:1px solid #e2e8f0;text-align:right;font-family:monospace;">${row.mbps != null ? row.mbps.toFixed(2) : '—'}</td>
      <td style="padding:8px;border:1px solid #e2e8f0;text-align:center;font-weight:700;">${escapeHtml(row.verdict || '—')}</td>
    </tr>`
          )
          .join('');

  const field = (label: string, value: string) =>
    `<div style="background:#f8fafc;padding:10px;border-radius:8px;border:1px solid #e2e8f0;"><span style="font-size:9px;font-weight:900;color:#94a3b8;text-transform:uppercase;display:block;">${escapeHtml(label)}</span><span style="font-size:12px;font-weight:700;">${escapeHtml(display(value))}</span></div>`;

  return `<!DOCTYPE html><html><head><title>Informe ${escapeHtml(run.runId)}</title></head><body style="font-family:Inter,sans-serif;padding:32px;">
    <h1>Informe ont_runs (columnas planas)</h1>
    <p style="color:${verdictColor};font-weight:900;">${escapeHtml(verdict)} · ${escapeHtml(run.runId)}</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:16px 0;">
      ${field('Serie', run.serial)}${field('MAC', run.mac)}${field('Modelo', run.model)}
      ${field('TX óptico', run.txOpticalPower)}${field('RX óptico', run.rxOpticalPower)}${field('Temp', run.workingTemperature)}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;"><thead><tr style="background:#181c3a;color:#fff;"><th>Tipo</th><th>Origen</th><th>Destino</th><th>Mbps</th><th>Veredicto</th></tr></thead><tbody>${throughputRows}</tbody></table>
    <p style="font-size:9px;color:#94a3b8;margin-top:24px;">Sin report_json — ${escapeHtml(formatRecordedAt(run.recordedAt))}</p>
  </body></html>`;
}

/** Imprime / guarda PDF con el mismo esquema del certificador (report_json) cuando existe. */
export async function printOntRunReport(run: OntRun): Promise<void> {
  let resolved = run;
  try {
    const fresh = await fetchOntRunByRunId(run.runId);
    if (fresh) resolved = fresh;
  } catch {
    /* fila de lista */
  }

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = renderCertifierReportHtml(resolved) || renderLegacyFlatReport(resolved);
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
}
