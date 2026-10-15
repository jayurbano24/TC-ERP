import type { OntRun } from '../domain/types';
import { prepareRunForCertificatePrint } from '../domain/enrichCertificateSheetForPrint';
import { renderCertificateSheetHtml } from './certificateSheetHtml';

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function displayScalar(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'string') return value.trim() || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

type ReportDoc = Record<string, unknown>;

export type CertifierDeviceProfile = 'ont' | 'emta' | 'generic';

export function resolveCertifierProfile(run: OntRun): CertifierDeviceProfile {
  const report = run.reportJson;
  const dutObj = report && isPlainObject(report.dut) ? report.dut : undefined;
  const kind = String(run.kind || report?.dut_profile || dutObj?.type || '')
    .trim()
    .toLowerCase();
  const deviceType = run.deviceType.toUpperCase();

  if (kind.includes('ont') || kind.includes('gpon')) return 'ont';
  if (kind.includes('emta') || kind.includes('docsis') || kind.includes('cable')) return 'emta';
  if (deviceType.includes('EMTA') || deviceType.includes('DOCSIS') || deviceType.includes('CGN')) return 'emta';
  if (deviceType.includes('ONT') || deviceType.includes('GPON') || deviceType.startsWith('HG')) return 'ont';
  return 'generic';
}

const REPORT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
  * { box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; margin: 0; color: #1e293b; font-size: 10px; line-height: 1.45; }
  .top-band { background: #181c3a; color: #fff; padding: 14px 24px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
  .top-band .brand { font-size: 11px; font-weight: 900; letter-spacing: 0.14em; text-transform: uppercase; color: #2ec4f1; }
  .top-band h1 { margin: 4px 0 0; font-size: 17px; font-weight: 900; line-height: 1.25; max-width: 520px; }
  .top-band .run-id { font-size: 20px; font-weight: 900; text-align: right; }
  .top-band .profile { font-size: 9px; font-weight: 700; opacity: 0.85; text-transform: uppercase; margin-top: 4px; }
  .verdict-strip { padding: 10px 24px; font-size: 14px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
  .verdict-strip.pass { background: #ecfdf5; color: #047857; border-bottom: 3px solid #059669; }
  .verdict-strip.fail { background: #fef2f2; color: #b91c1c; border-bottom: 3px solid #dc2626; }
  .verdict-strip.neutral { background: #f8fafc; color: #475569; border-bottom: 3px solid #94a3b8; }
  .content { padding: 18px 24px 28px; }
  .section { margin-top: 18px; page-break-inside: avoid; }
  .section-title { font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.12em; color: #b91c1c; border-bottom: 2px solid #b91c1c; padding-bottom: 4px; margin-bottom: 8px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; }
  .grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
  .field .lbl { font-size: 8px; font-weight: 900; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
  .field .val { font-size: 10px; font-weight: 700; word-break: break-word; }
  table.sheet { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 9px; }
  table.sheet th { background: #b91c1c; color: #fff; padding: 7px 8px; text-align: left; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid #991b1b; }
  table.sheet td { border: 1px solid #e2e8f0; padding: 6px 8px; vertical-align: top; }
  table.sheet td.num { text-align: right; font-family: ui-monospace, monospace; font-weight: 700; }
  table.sheet tr:nth-child(even) td { background: #fafafa; }
  table.sheet td.lbl { width: 34%; font-weight: 700; background: #f8fafc; color: #475569; }
  .reasons { margin: 6px 0 0; padding-left: 18px; color: #334155; }
  .disclaimer { margin-top: 20px; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 8px; color: #64748b; line-height: 1.5; }
  .footer { margin-top: 16px; text-align: center; font-size: 8px; color: #94a3b8; }
  table.sheet td.cell-pass { background: #ecfdf5; color: #047857; font-weight: 800; text-align: center; }
  table.sheet td.cell-fail { background: #fef2f2; color: #b91c1c; font-weight: 800; text-align: center; }
  table.sheet td.cell-skip { background: #f1f5f9; color: #64748b; text-align: center; }
  table.sheet td .note { font-size: 8px; font-weight: 600; color: #94a3b8; }
  .pill-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
  .pill { font-size: 8px; font-weight: 800; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; background: #f1f5f9; color: #475569; }
  @media print {
    .top-band, .verdict-strip { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    table.sheet th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function field(label: string, value: unknown): string {
  return `<div class="field"><div class="lbl">${escapeHtml(label)}</div><div class="val">${escapeHtml(displayScalar(value))}</div></div>`;
}

function specTable(title: string, pairs: Array<[string, unknown]>): string {
  const rows = pairs
    .filter(([, v]) => displayScalar(v) !== '—')
    .map(
      ([label, value]) =>
        `<tr><td class="lbl">${escapeHtml(label)}</td><td>${escapeHtml(displayScalar(value))}</td></tr>`
    )
    .join('');
  if (!rows) return '';
  return `<div class="section"><div class="section-title">${escapeHtml(title)}</div><table class="sheet"><tbody>${rows}</tbody></table></div>`;
}

function renderReasons(reasons: unknown): string {
  if (!Array.isArray(reasons) || reasons.length === 0) return '';
  return `<ul class="reasons">${reasons.map((r) => `<li>${escapeHtml(displayScalar(r))}</li>`).join('')}</ul>`;
}

function renderPortsTable(ports: unknown): string {
  if (!Array.isArray(ports) || ports.length === 0) return '';
  const body = ports
    .map((port) => {
      if (!isPlainObject(port)) return '';
      const link = isPlainObject(port.link) ? port.link : {};
      const dhcp = isPlainObject(port.dhcp) ? port.dhcp : {};
      return `<tr>
        <td>${escapeHtml(displayScalar(port.logical_name))}</td>
        <td>${escapeHtml(displayScalar(port.verdict))}</td>
        <td>${escapeHtml(displayScalar(link.speed_mbps))} Mbps · ${escapeHtml(displayScalar(link.duplex))}</td>
        <td>${escapeHtml(displayScalar(dhcp.ip))}</td>
        <td class="num">${port.rx_mbps != null ? Number(port.rx_mbps).toFixed(2) : '—'}</td>
        <td class="num">${port.tx_mbps != null ? Number(port.tx_mbps).toFixed(2) : '—'}</td>
        <td>${escapeHtml(displayScalar(port.physical_verdict))}</td>
        <td>${escapeHtml(displayScalar(port.iperf_state))}</td>
      </tr>`;
    })
    .join('');
  return `
    <div class="section">
      <div class="section-title">Certificación de puertos Ethernet</div>
      <table class="sheet">
        <thead><tr>
          <th>Puerto</th><th>Veredicto</th><th>Enlace</th><th>DHCP</th><th>RX Mbps</th><th>TX Mbps</th><th>Físico</th><th>iPerf</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function flowReasonsText(flow: Record<string, unknown>): string {
  const parts: string[] = [];
  if (Array.isArray(flow.reasons)) {
    parts.push(...flow.reasons.map((r) => displayScalar(r)));
  }
  const delta = flow.error_delta;
  if (isPlainObject(delta) && Array.isArray(delta.reasons)) {
    parts.push(...delta.reasons.map((r) => displayScalar(r)));
  }
  if (typeof flow.assessment === 'string' && flow.assessment.trim()) {
    parts.push(flow.assessment.trim());
  }
  return parts.filter(Boolean).join(' · ') || '—';
}

function renderFlowsTable(flows: unknown): string {
  if (!Array.isArray(flows) || flows.length === 0) return '';
  const body = flows
    .map((flow) => {
      if (!isPlainObject(flow)) return '';
      const delta = isPlainObject(flow.error_delta) ? flow.error_delta : null;
      return `<tr>
        <td>${escapeHtml(displayScalar(flow.case_id))}</td>
        <td>${escapeHtml(displayScalar(flow.kind))}</td>
        <td>${escapeHtml(displayScalar(flow.source))} → ${escapeHtml(displayScalar(flow.destination))}</td>
        <td class="num">${flow.mbps_avg != null ? Number(flow.mbps_avg).toFixed(2) : '—'}</td>
        <td class="num">${flow.mbps_min != null ? Number(flow.mbps_min).toFixed(2) : '—'}</td>
        <td class="num">${flow.mbps_max != null ? Number(flow.mbps_max).toFixed(2) : '—'}</td>
        <td>${escapeHtml(displayScalar(flow.verdict))}</td>
        <td>${escapeHtml(delta ? displayScalar(delta.verdict) : '—')}</td>
        <td>${escapeHtml(flowReasonsText(flow))}</td>
      </tr>`;
    })
    .join('');
  return `
    <div class="section">
      <div class="section-title">Pruebas de tráfico (iPerf3)</div>
      <table class="sheet">
        <thead><tr><th>Caso</th><th>Tipo</th><th>Ruta</th><th>Avg Mbps</th><th>Min</th><th>Max</th><th>Veredicto</th><th>Errores Δ</th><th>Detalle</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function matrixCellClass(verdict: string): string {
  const v = verdict.toUpperCase();
  if (v === 'PASS') return 'cell-pass';
  if (v === 'FAIL') return 'cell-fail';
  return 'cell-skip';
}

function renderMatrixTable(matrix: unknown): string {
  if (!isPlainObject(matrix)) return '';
  const rowKeys = Object.keys(matrix);
  if (rowKeys.length === 0) return '';

  const colSet = new Set<string>();
  for (const rk of rowKeys) {
    const row = matrix[rk];
    if (isPlainObject(row)) {
      for (const ck of Object.keys(row)) colSet.add(ck);
    }
  }
  const cols = Array.from(colSet).sort();
  if (cols.length === 0) return '';

  const body = rowKeys
    .map((rk) => {
      const row = matrix[rk];
      if (!isPlainObject(row)) return '';
      const cells = cols
        .map((ck) => {
          const cell = row[ck];
          if (!isPlainObject(cell)) return `<td class="cell-skip">—</td>`;
          const verdict = displayScalar(cell.verdict);
          const mbps = cell.mbps != null ? `${Number(cell.mbps).toFixed(1)} Mbps` : '';
          const note = displayScalar(cell.note);
          const inner = [verdict, mbps].filter((x) => x && x !== '—').join('<br/>');
          const noteHtml = note !== '—' && note !== '' ? `<span class="note">${escapeHtml(note)}</span>` : '';
          return `<td class="${matrixCellClass(verdict)}">${inner}${noteHtml ? `<br/>${noteHtml}` : ''}</td>`;
        })
        .join('');
      return `<tr><td class="lbl">${escapeHtml(rk)}</td>${cells}</tr>`;
    })
    .join('');

  return `
    <div class="section">
      <div class="section-title">Matriz de tráfico entre puertos LAN</div>
      <table class="sheet">
        <thead><tr><th>Origen ↓ / Dest →</th>${cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function renderStages(stages: unknown): string {
  if (!Array.isArray(stages) || stages.length === 0) return '';
  const pills = stages.map((s) => `<span class="pill">${escapeHtml(displayScalar(s))}</span>`).join('');
  return `<div class="section"><div class="section-title">Etapas ejecutadas</div><div class="pill-row">${pills}</div></div>`;
}

function renderDocsisChannelTable(title: string, rows: unknown): string {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const sample = rows.find(isPlainObject);
  if (!sample) return '';
  const keys = Object.keys(sample).slice(0, 8);
  const head = keys.map((k) => `<th>${escapeHtml(k)}</th>`).join('');
  const body = rows
    .slice(0, 32)
    .map((row) => {
      if (!isPlainObject(row)) return '';
      return `<tr>${keys.map((k) => `<td>${escapeHtml(displayScalar(row[k]))}</td>`).join('')}</tr>`;
    })
    .join('');
  return `
    <div class="section">
      <div class="section-title">${escapeHtml(title)}</div>
      <table class="sheet"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>`;
}

function renderSharedPerformanceSections(report: ReportDoc): string {
  return `
    ${renderStages(report.stages)}
    ${specTable('Perfil de prueba', [
      ['Perfil', report.profile],
      ['Speed profile', report.speed_profile],
      ['Network mode', report.network_mode],
      ['WiFi state', report.wifi_state],
      ['WiFi interface', report.wifi_interface],
      ['WiFi address', report.wifi_address],
      ['WiFi excluded', report.wifi_excluded],
      ['Tool version', report.tool_version],
      ['Schema', report.schema_version],
    ])}
    ${renderMatrixTable(report.matrix)}
    ${renderPortsTable(report.ports)}
    ${renderFlowsTable(report.flows)}
  `;
}

function renderWanRows(dut: Record<string, unknown> | undefined): string {
  const rows = dut?.wan_rows;
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const body = rows
    .map((row) => {
      if (!isPlainObject(row)) return '';
      return `<tr>
        <td>${escapeHtml(displayScalar(row.name))}</td>
        <td>${escapeHtml(displayScalar(row.service))}</td>
        <td>${escapeHtml(displayScalar(row.vlan))}</td>
        <td>${escapeHtml(displayScalar(row.status))}</td>
        <td>${escapeHtml(displayScalar(row.address))}</td>
      </tr>`;
    })
    .join('');
  return `
    <div class="section">
      <div class="section-title">Interfaces WAN (ONT)</div>
      <table class="sheet">
        <thead><tr><th>Nombre</th><th>Servicio</th><th>VLAN</th><th>Estado</th><th>Dirección</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function renderOntBody(report: ReportDoc, dut: Record<string, unknown> | undefined): string {
  return `
    ${specTable('Parámetros ópticos GPON / PON', [
      ['Modo PON', dut?.pon_mode],
      ['Estado ONT', dut?.ont_state],
      ['Enlace óptico', dut?.optic_link],
      ['LOS', dut?.los_status],
      ['TX óptico', dut?.optical_tx],
      ['RX óptico', dut?.optical_rx],
      ['Corriente bias', dut?.optical_bias],
      ['Temperatura', dut?.optical_temperature],
      ['Voltaje', dut?.optical_voltage],
      ['Distancia', dut?.optic_distance],
      ['λ TX', dut?.tx_wavelength],
      ['λ RX', dut?.rx_wavelength],
      ['Módulo óptico', dut?.optic_module],
      ['Vendor óptico', dut?.optic_vendor],
      ['Registro OLT', dut?.registration],
    ])}
    ${specTable('Identidad WiFi (si aplica)', [
      ['SSID 2.4 GHz', dut?.ssid_24],
      ['SSID 5 GHz', dut?.ssid_50],
      ['Clave 2.4 GHz', dut?.wifi_password_24],
      ['Clave 5 GHz', dut?.wifi_password_50],
      ['Canal WLAN', dut?.wlan_channel],
      ['Estado WLAN', dut?.wlan_status],
    ])}
    ${renderWanRows(dut)}
    ${renderSharedPerformanceSections(report)}
    ${renderOntMeasurements(report.measurements)}
  `;
}

function renderOntMeasurements(measurements: unknown): string {
  if (!Array.isArray(measurements) || measurements.length === 0) return '';
  const body = measurements
    .map((m, idx) => {
      if (!isPlainObject(m) || !isPlainObject(m.dut)) return '';
      const d = m.dut;
      return `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(displayScalar(d.optical_rx))}</td>
        <td>${escapeHtml(displayScalar(d.optical_tx))}</td>
        <td>${escapeHtml(displayScalar(d.optical_bias))}</td>
        <td>${escapeHtml(displayScalar(d.optical_temperature))}</td>
        <td>${escapeHtml(displayScalar(d.optical_voltage))}</td>
        <td>${escapeHtml(displayScalar(d.los_status))}</td>
      </tr>`;
    })
    .join('');
  if (!body) return '';
  return `
    <div class="section">
      <div class="section-title">Serie de mediciones ópticas</div>
      <table class="sheet">
        <thead><tr><th>#</th><th>RX</th><th>TX</th><th>Bias</th><th>Temp</th><th>Volt</th><th>LOS</th></tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

function renderEmtaBody(report: ReportDoc, dut: Record<string, unknown> | undefined): string {
  return `
    ${specTable('Interfaz DOCSIS / cablemódem', [
      ['Estado DOCSIS', dut?.docsis_status],
      ['Marca', dut?.brand],
      ['Canales DS', dut?.ds_channels],
      ['Canales US', dut?.us_channels],
      ['Potencia DS', dut?.ds_power],
      ['Potencia US', dut?.us_power],
    ])}
    ${specTable('WLAN / datos de servicio', [
      ['Estado WLAN', dut?.wlan_status],
      ['Canales', dut?.wlan_channel],
      ['SSID 2.4 GHz', dut?.ssid_24],
      ['SSID 5 GHz', dut?.ssid_50],
      ['Clave 2.4 GHz', dut?.wifi_password_24],
      ['Clave 5 GHz', dut?.wifi_password_50],
    ])}
    ${renderDocsisChannelTable('Downstream (DS)', dut?.ds_rows)}
    ${renderDocsisChannelTable('Upstream (US)', dut?.us_rows)}
    ${renderSharedPerformanceSections(report)}
  `;
}

function renderGenericBody(report: ReportDoc, dut: Record<string, unknown> | undefined): string {
  const dutRows = dut
    ? Object.entries(dut)
        .filter(([, v]) => !(Array.isArray(v) && v.length === 0))
        .slice(0, 40)
        .map(([k, v]) => `<tr><td class="lbl">${escapeHtml(k)}</td><td>${escapeHtml(displayScalar(v))}</td></tr>`)
        .join('')
    : '';
  return `
    ${dutRows ? `<div class="section"><div class="section-title">DUT</div><table class="sheet"><tbody>${dutRows}</tbody></table></div>` : ''}
    ${renderSharedPerformanceSections(report)}
  `;
}

function renderHeader(report: ReportDoc, run: OntRun, profile: CertifierDeviceProfile): string {
  const title = displayScalar(report.title);
  const profileLabel = profile === 'ont' ? 'ONT / GPON' : profile === 'emta' ? 'EMTA / DOCSIS' : 'Genérico';
  return `
    <div class="top-band">
      <div>
        <div class="brand">TECHCORP · Laboratorio de certificación</div>
        <h1>${escapeHtml(title)}</h1>
        <div class="profile">Perfil ${escapeHtml(profileLabel)} · ${escapeHtml(displayScalar(report.started_at_local || run.recordedAt))}</div>
      </div>
      <div>
        <div class="run-id">${escapeHtml(displayScalar(report.run_id || run.runId))}</div>
      </div>
    </div>`;
}

function renderVerdictStrip(globalVerdict: string): string {
  const v = globalVerdict.toUpperCase();
  const cls = v === 'PASS' ? 'pass' : v === 'FAIL' ? 'fail' : 'neutral';
  return `<div class="verdict-strip ${cls}">Resultado global: ${escapeHtml(globalVerdict)}</div>`;
}

function renderContextGrid(report: ReportDoc, run: OntRun, dut: Record<string, unknown> | undefined): string {
  return `
    <div class="section">
      <div class="section-title">Identificación del equipo y contexto</div>
      <div class="grid-3">
        ${field('Serie', dut?.serial || run.serial)}
        ${field('MAC', dut?.mac || run.mac)}
        ${field('Modelo', dut?.model || run.model)}
        ${field('Tipo', dut?.device_type || run.deviceType)}
        ${field('Firmware', dut?.firmware || run.softwareVersion)}
        ${field('Hardware', dut?.hardware || run.hardwareVersion)}
        ${field('Estación', report.station || run.station)}
        ${field('Operador', report.operator || run.operator)}
        ${field('Perfil velocidad', report.profile ?? report.speed_profile)}
        ${field('Orden de trabajo', dut?.work_order)}
        ${field('Job', isPlainObject(report.job) ? displayScalar(report.job.number ?? report.job.id) : report.job)}
        ${field('Simultáneo', report.simultaneous_verdict)}
        ${field('Bidireccional', report.bidirectional_verdict)}
        ${field('Estabilidad', report.stability_verdict)}
        ${field('Errores', report.errors_verdict)}
        ${field('Inicio', report.started_at_local)}
        ${field('Fin', report.finished_at_local)}
      </div>
      ${renderReasons(report.global_reasons)}
    </div>`;
}

/** HTML de certificación — diseño único certificate_sheet (documento LAB TECHCORP). */
export function renderCertifierReportHtml(run: OntRun): string {
  let prepared = run;
  try {
    prepared = prepareRunForCertificatePrint(run);
  } catch (err) {
    console.warn('[certifier-report] prepareRunForCertificatePrint:', err);
  }
  const labSheetHtml = renderCertificateSheetHtml(prepared);
  if (labSheetHtml) return labSheetHtml;

  const report = prepared.reportJson;
  if (!report || !isPlainObject(report)) return '';

  const profile = resolveCertifierProfile(prepared);
  const dut = isPlainObject(report.dut) ? report.dut : undefined;
  const globalVerdict = displayScalar(report.global_verdict || prepared.verdict);

  const body =
    profile === 'ont'
      ? renderOntBody(report, dut)
      : profile === 'emta'
        ? renderEmtaBody(report, dut)
        : renderGenericBody(report, dut);

  const host = isPlainObject(report.host) ? report.host : undefined;
  const hostBlock = host
    ? specTable('Host de prueba', [
        ['Hostname', host.hostname],
        ['SO', host.os],
        ['Kernel', host.kernel],
        ['CPU', host.cpu],
        ['Memoria MB', host.memory_mb],
        ['Tool version', host.tool_version ?? report.tool_version],
      ])
    : '';

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>${escapeHtml(displayScalar(report.title))} ${escapeHtml(prepared.runId)}</title><style>${REPORT_STYLES}</style></head><body>
    ${renderHeader(report, prepared, profile)}
    ${renderVerdictStrip(globalVerdict)}
    <div class="content">
      ${renderContextGrid(report, prepared, dut)}
      ${body}
      ${hostBlock}
      ${report.disclaimer ? `<div class="disclaimer">${escapeHtml(displayScalar(report.disclaimer))}</div>` : ''}
      <div class="footer">TC-ERP · Reimpresión certificada · ont_runs.report_json · ${escapeHtml(new Date().toLocaleString('es-GT'))}</div>
    </div>
  </body></html>`;
}
