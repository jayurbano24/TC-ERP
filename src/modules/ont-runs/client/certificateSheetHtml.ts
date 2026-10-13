import type { OntRun } from '../domain/types';
import { tcTechcorpLogoPrintHtml } from '@/lib/brand/tcTechcorpLogoPrintHtml';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

type SheetRow = {
  section: string;
  name: string;
  read: string;
  expected: string;
  state: string;
};

type PhysicalRow = {
  name: string;
  read: string;
  expected: string;
  state: string;
};

type RfChannelRow = {
  channel?: string;
  state?: string;
  modulation?: string;
  identity?: string;
  power?: string;
  snr?: string;
  correctable?: string;
  uncorrectable?: string;
};

type CertificateSheet = Record<string, unknown>;

type SheetProfile = 'emta' | 'ont';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function resolveSheetProfile(run: OntRun, sheet: CertificateSheet): SheetProfile {
  if (sheet.emta === true) return 'emta';
  if (sheet.ont === true) return 'ont';
  const kind = (run.kind || str(sheet.dut_profile)).toLowerCase();
  if (kind.includes('emta') || kind.includes('docsis')) return 'emta';
  if (kind.includes('ont') || kind.includes('gpon')) return 'ont';
  if (Array.isArray(sheet.cpe_rows) && sheet.cpe_rows.length > 0) return 'ont';
  return 'emta';
}

function parseRows(raw: unknown): SheetRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .map((r) => ({
      section: str(r.section),
      name: str(r.name),
      read: str(r.read) || '—',
      expected: str(r.expected) || '—',
      state: str(r.state) || '—',
    }))
    .filter((r) => r.name);
}

function parsePhysicalRows(raw: unknown): PhysicalRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isPlainObject)
    .map((r) => ({
      name: str(r.name),
      read: str(r.read) || '—',
      expected: str(r.expected) || '—',
      state: str(r.state) || '—',
    }))
    .filter((r) => r.name);
}

function parseRfRows(raw: unknown): RfChannelRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isPlainObject) as RfChannelRow[];
}

function complyClass(state: string): string {
  const s = state.toLowerCase();
  if (s === 'sí' || s === 'si' || s === 'cumple' || s === 'pass') return 'comply-yes';
  if (s === 'no' || s === 'fail' || s === 'reprobado') return 'comply-no';
  return 'comply-na';
}

function physicalClass(state: string): string {
  const s = state.toUpperCase();
  if (s === 'PASS') return 'result-pass';
  if (s === 'FAIL') return 'result-fail';
  if (s === 'NO_MEDIDO' || s === 'N/A') return 'result-na';
  return 'result-neutral';
}

function headlineClass(headline: string, approved: boolean): string {
  const h = headline.toUpperCase();
  if (approved || h.includes('APROB') || h.includes('CERTIFIC')) return 'headline-pass';
  if (h.includes('REPROB') || h.includes('NO CERT')) return 'headline-fail';
  return 'headline-neutral';
}

function computeTallyFromRows(rows: SheetRow[]): string {
  let yes = 0;
  let no = 0;
  let na = 0;
  for (const row of rows) {
    const c = complyClass(row.state);
    if (c === 'comply-yes') yes += 1;
    else if (c === 'comply-no') no += 1;
    else na += 1;
  }
  return `${yes} Sí · ${no} No · ${na} N/A · total ${rows.length}`;
}

const SHEET_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap');
  * { box-sizing: border-box; }
  @page { size: A4; margin: 10mm 12mm; }
  @page anexo-landscape { size: A4 landscape; margin: 8mm 10mm; }
  body { margin: 0; font-family: Inter, Arial, sans-serif; color: #0f172a; font-size: 10px; line-height: 1.45; background: #fff; }
  .page { max-width: 100%; }
  .cert-main, .cert-anexo { padding: 0; max-width: 100%; }
  .cert-anexo { page: anexo-landscape; page-break-before: always; break-before: page; margin-top: 8px; }
  .lab-strip { display: flex; justify-content: space-between; align-items: center; font-size: 8px; color: #64748b; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
  .lab-strip .lab-url { color: #94a3b8; max-width: 48%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .masthead { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding-bottom: 14px; border-bottom: 2px solid #e2e8f0; margin-bottom: 18px; page-break-inside: avoid; }
  .brand-block { flex: 1; min-width: 0; }
  .brand-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
  .brand-logo { height: 52px; width: auto; flex-shrink: 0; display: block; }
  .brand-name { font-size: 28px; font-weight: 900; letter-spacing: 0.02em; color: #2e3165; text-transform: uppercase; line-height: 1; }
  .brand-subtitle { margin: 0; font-size: 9px; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: #334155; max-width: 480px; }
  .brand-web { margin: 4px 0 0; font-size: 10px; font-weight: 700; color: #2563eb; }
  .meta-block { text-align: right; min-width: 200px; }
  .meta-block .line { margin: 0 0 4px; font-size: 10px; }
  .meta-block .line strong { font-weight: 900; }
  .meta-block .date { margin-top: 8px; font-size: 10px; font-weight: 700; color: #475569; text-transform: capitalize; }
  .anexo-head { text-align: right; margin-bottom: 16px; width: 100%; overflow: visible; }
  .anexo-head h1 { margin: 0; font-size: 17px; font-weight: 900; color: #1e3a8a; letter-spacing: 0; white-space: nowrap; }
  .anexo-head p { margin: 4px 0 0; font-size: 10px; font-weight: 800; color: #334155; }
  .result-block { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 8px 0 20px; page-break-inside: avoid; }
  .result-block h2 { margin: 0 0 6px; font-size: 11px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; }
  .headline { font-size: 32px; font-weight: 900; letter-spacing: -0.02em; line-height: 1; }
  .headline-pass { color: #16a34a; }
  .headline-fail { color: #dc2626; }
  .headline-neutral { color: #475569; }
  .summary-line { margin-top: 8px; font-size: 9px; color: #64748b; font-weight: 600; max-width: 520px; }
  .stamp { width: 88px; height: 88px; border-radius: 50%; border: 4px solid #16a34a; display: flex; align-items: center; justify-content: center; font-size: 22px; font-weight: 900; color: #16a34a; flex-shrink: 0; }
  .stamp.fail { border-color: #dc2626; color: #dc2626; }
  .section-title { margin: 18px 0 8px; font-size: 10px; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase; color: #0f172a; }
  .tally { margin-bottom: 8px; font-size: 9px; font-weight: 700; color: #64748b; }
  table.params { width: 100%; border-collapse: collapse; margin-bottom: 8px; page-break-inside: auto; }
  table.params tbody tr { page-break-inside: avoid; break-inside: avoid; }
  table.params thead th { text-align: left; font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; color: #1e3a8a; padding: 8px 6px; border-bottom: 2px solid #cbd5e1; }
  table.params tbody td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; font-size: 9.5px; }
  table.params tbody tr.section-row td { padding-top: 12px; padding-bottom: 4px; border-bottom: none; font-size: 9px; font-weight: 900; letter-spacing: 0.08em; text-transform: uppercase; color: #1e3a8a; }
  table.params td.param { font-weight: 700; color: #334155; width: 32%; }
  table.params td.read { width: 28%; }
  table.params td.expected { color: #475569; width: 28%; }
  table.params td.comply { width: 12%; font-weight: 900; text-align: right; }
  .comply-yes { color: #16a34a; }
  .comply-no { color: #dc2626; }
  .comply-na { color: #64748b; }
  table.rf-anexo { width: 100%; border-collapse: collapse; margin: 8px 0 14px; font-size: 7.5px; table-layout: fixed; }
  table.rf-anexo thead { display: table-header-group; }
  table.rf-anexo thead th { text-align: left; font-size: 7px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.02em; color: #1e3a8a; padding: 6px 3px; border-bottom: 2px solid #1e3a8a; vertical-align: bottom; line-height: 1.2; }
  table.rf-anexo tbody td { padding: 4px 3px; border-bottom: 1px solid #eef2f7; vertical-align: top; line-height: 1.25; word-wrap: break-word; }
  table.rf-anexo td.rf-num, table.rf-anexo th.rf-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  table.rf-anexo td.rf-chan { width: 6%; white-space: nowrap; }
  table.rf-anexo td.rf-freq { font-size: 7px; }
  .rf-band { margin: 12px 0 4px; font-size: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.06em; color: #1e3a8a; border-bottom: 2px solid #93c5fd; padding-bottom: 3px; page-break-after: avoid; }
  .rf-empty { margin: 8px 0 16px; padding: 10px 12px; border: 1px dashed #cbd5e1; border-radius: 8px; font-size: 9px; color: #64748b; line-height: 1.5; background: #f8fafc; }
  table.rf-anexo tbody tr.total-row td { font-weight: 900; border-top: 2px solid #cbd5e1; padding-top: 6px; }
  .result-pass { color: #16a34a; font-weight: 900; }
  .result-fail { color: #dc2626; font-weight: 900; }
  .result-na { color: #64748b; font-weight: 800; }
  .result-neutral { color: #475569; font-weight: 800; }
  .chart-block { margin: 12px 0 16px; page-break-inside: avoid; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
  .chart-block .optic { margin: 0; }
  .chart-block h3 { margin: 0 0 10px; font-size: 10px; font-weight: 900; letter-spacing: 0.06em; text-transform: uppercase; }
  .optic-top { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
  .optic-top .legend { margin: 0; font-size: 8px; color: #64748b; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: middle; }
  .meter-ds { background: #38bdf8; }
  .meter-us { background: #4ade80; }
  .meter-bad { background: #fb7185; }
  .rx { background: #38bdf8; }
  .tx { background: #fbbf24; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 6px 10px; min-width: 90px; }
  .chip small { display: block; font-size: 7px; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin-bottom: 2px; }
  .chip b { font-size: 10px; font-weight: 900; }
  .optic-note { font-size: 8px; color: #64748b; margin: 6px 0 0; }
  .rf-meter { max-width: 100%; height: auto; display: block; margin-top: 8px; }
  .page-tag { margin-top: 16px; text-align: right; font-size: 8px; font-weight: 800; color: #94a3b8; text-transform: uppercase; }
  .doc-footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e2e8f0; font-size: 7.5px; color: #94a3b8; line-height: 1.55; text-align: center; }
  .doc-footer .legend-note { margin-top: 6px; font-size: 7px; color: #cbd5e1; }
  @media print {
    .cert-anexo { page-break-before: always; break-before: page; }
    .stamp, .headline-pass, .comply-yes, table.rf-anexo thead th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
`;

function renderBrandBlock(subtitle: string, maskId: string): string {
  return `
    <div class="brand-block">
      ${tcTechcorpLogoPrintHtml(maskId)}
      <p class="brand-subtitle">${escapeHtml(subtitle)}</p>
      <p class="brand-web">www.techcorpca.com</p>
    </div>`;
}

const EMTA_PHYSICAL_LEGEND =
  'Leyenda: Verde · DS ≥ 16, RX −10 … 10 dBmV, US TX 30–61 dBmV · Ámbar · DS 5–15 o un solo canal US · Rojo · DS ≤ 4, TX < 30 dBmV o MER < 28 dB · FEC ausente = NO_MEDIDO';

function renderLabStrip(order: string): string {
  return `<div class="lab-strip"><span>${escapeHtml(order)} — TECHCORP LAB</span><span class="lab-url">http://127.0.0.1:8080/cert/${escapeHtml(order)}</span></div>`;
}

function renderParamsTable(rows: SheetRow[], tallyLabel: string): string {
  if (rows.length === 0) return '';

  let lastSection = '';
  const body = rows
    .map((row) => {
      const sectionHeader =
        row.section && row.section !== lastSection
          ? (() => {
              lastSection = row.section;
              return `<tr class="section-row"><td colspan="4">${escapeHtml(row.section)}</td></tr>`;
            })()
          : '';
      return `${sectionHeader}<tr>
        <td class="param">${escapeHtml(row.name)}</td>
        <td class="read">${escapeHtml(row.read)}</td>
        <td class="expected">${escapeHtml(row.expected)}</td>
        <td class="comply ${complyClass(row.state)}">${escapeHtml(row.state)}</td>
      </tr>`;
    })
    .join('');

  return `
    <div class="section-title">Parámetros · leído vs esperado</div>
    <div class="tally">${escapeHtml(tallyLabel)}</div>
    <table class="params">
      <thead><tr><th>Parámetro</th><th>Leído</th><th>Esperado</th><th>Cumple</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

const RF_TABLE_HEAD = `
  <colgroup>
    <col style="width:5%" />
    <col style="width:11%" />
    <col style="width:10%" />
    <col style="width:22%" />
    <col style="width:11%" />
    <col style="width:8%" />
    <col style="width:16%" />
    <col style="width:17%" />
  </colgroup>
  <thead><tr>
    <th>Canal</th><th>Estado</th><th>Modulación</th><th>ID / Frecuencia</th>
    <th class="rf-num">Potencia</th><th class="rf-num">SNR</th>
    <th class="rf-num">Corregibles</th><th class="rf-num">Incorregibles</th>
  </tr></thead>`;

function rfDataRows(rows: RfChannelRow[]): { html: string; sumCorr: number; sumUnc: number } {
  if (rows.length === 0) return { html: '', sumCorr: 0, sumUnc: 0 };
  let sumCorrect = 0;
  let sumUncorrect = 0;
  const html = rows
    .map((row) => {
      const corr = Number(String(row.correctable ?? '0').replace(/,/g, ''));
      const unc = Number(String(row.uncorrectable ?? '0').replace(/,/g, ''));
      if (!Number.isNaN(corr)) sumCorrect += corr;
      if (!Number.isNaN(unc)) sumUncorrect += unc;
      const snr = str(row.snr);
      const snrCell = snr === '—' || snr === '' ? '—' : snr;
      return `<tr>
        <td class="rf-chan">${escapeHtml(str(row.channel))}</td>
        <td>${escapeHtml(str(row.state))}</td>
        <td>${escapeHtml(str(row.modulation))}</td>
        <td class="rf-freq">${escapeHtml(str(row.identity))}</td>
        <td class="rf-num">${escapeHtml(str(row.power))}</td>
        <td class="rf-num">${escapeHtml(snrCell)}</td>
        <td class="rf-num">${escapeHtml(str(row.correctable))}</td>
        <td class="rf-num">${escapeHtml(str(row.uncorrectable))}</td>
      </tr>`;
    })
    .join('');
  return { html, sumCorr: sumCorrect, sumUnc: sumUncorrect };
}

function renderEmtaRfAnexoTable(dsRows: RfChannelRow[], usRows: RfChannelRow[]): string {
  if (dsRows.length === 0 && usRows.length === 0) return '';

  const ds = rfDataRows(dsRows);
  const us = rfDataRows(usRows);
  const dsTotal =
    dsRows.length > 0
      ? `<tr class="total-row"><td colspan="6"><strong>Total</strong></td><td class="rf-num"><strong>${ds.sumCorr.toLocaleString('es-GT')}</strong></td><td class="rf-num"><strong>${ds.sumUnc.toLocaleString('es-GT')}</strong></td></tr>`
      : '';

  const dsBlock =
    dsRows.length > 0
      ? `
    <div class="rf-band">Downstream (DS)</div>
    <table class="rf-anexo">
      ${RF_TABLE_HEAD}
      <tbody>${ds.html}${dsTotal}</tbody>
    </table>`
      : '';

  const usBlock =
    usRows.length > 0
      ? `
    <div class="rf-band">Upstream (US)</div>
    <table class="rf-anexo">
      ${RF_TABLE_HEAD}
      <tbody>${us.html}</tbody>
    </table>`
      : '';

  return `<div class="section-title">Detalle de canales RF</div>${dsBlock}${usBlock}`;
}

function renderEmtaRfAnexoSection(dsRows: RfChannelRow[], usRows: RfChannelRow[]): string {
  if (dsRows.length > 0 || usRows.length > 0) {
    return renderEmtaRfAnexoTable(dsRows, usRows);
  }
  return `
    <div class="section-title">Detalle de canales RF</div>
    <div class="rf-empty">
      Esta corrida no incluye filas <strong>ds_rows</strong> / <strong>us_rows</strong> en el certificador
      (DOCSIS no operacional, prueba incompleta o RF no capturado). El PDF no puede inventar canales DS/US.
      Para ver el anexo completo, abra una corrida con RF medido (por ejemplo <strong>TC-0016</strong>).
    </div>`;
}

function rfChartHasSpectrum(html: string): boolean {
  if (!html.trim()) return false;
  if (html.includes('rf-meter') || html.includes('<svg')) return true;
  if (/sin canales de rf|sin lectura de espectro/i.test(html)) return false;
  return html.length > 400;
}

function embedRfChartHtml(raw: unknown): string {
  const html = str(raw);
  if (!rfChartHasSpectrum(html)) return '';
  return `<div class="chart-block">${html}</div>`;
}

function emtaNeedsAnexoPage(
  dsRows: RfChannelRow[],
  usRows: RfChannelRow[],
  rfChartRaw: unknown,
  physicalRows: PhysicalRow[]
): boolean {
  if (dsRows.length > 0 || usRows.length > 0) return true;
  if (rfChartHasSpectrum(str(rfChartRaw))) return true;
  return physicalRows.length > 0;
}

function resolveRfChannelRows(
  sheet: CertificateSheet,
  report: Record<string, unknown> | undefined
): { dsRows: RfChannelRow[]; usRows: RfChannelRow[] } {
  let dsRows = parseRfRows(sheet.ds_rows);
  let usRows = parseRfRows(sheet.us_rows);
  const dut = report && isPlainObject(report.dut) ? report.dut : undefined;
  if (dsRows.length === 0 && dut) dsRows = parseRfRows(dut.ds_rows);
  if (usRows.length === 0 && dut) usRows = parseRfRows(dut.us_rows);
  return { dsRows, usRows };
}

function renderPhysicalTable(rows: PhysicalRow[]): string {
  if (rows.length === 0) return '';
  const body = rows
    .map(
      (row) => `<tr>
        <td class="param">${escapeHtml(row.name)}</td>
        <td class="read">${escapeHtml(row.read)}</td>
        <td class="expected">${escapeHtml(row.expected)}</td>
        <td class="comply ${physicalClass(row.state)}">${escapeHtml(row.state)}</td>
      </tr>`
    )
    .join('');
  return `
    <div class="section-title">Desglose de certificación física</div>
    <table class="params">
      <thead><tr><th>Prueba</th><th>Leído</th><th>Criterio</th><th>Resultado</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;
}

function embedChartHtml(raw: unknown): string {
  const html = str(raw);
  if (!html) return '';
  return `<div class="chart-block">${html}</div>`;
}

function buildEmtaSummaryLine(sheet: CertificateSheet, pageCount: number): string {
  const measured = str(sheet.global_measured) || str(sheet.summary);
  const parts = [str(sheet.short_stamp), sheet.record_id ? `ID ${str(sheet.record_id)}` : '', measured].filter(Boolean);
  return `${parts.join(' · ')} · Hoja 1/${pageCount}`;
}

function renderEmtaCertificate(run: OntRun, sheet: CertificateSheet, report: Record<string, unknown>): string {
  const order = str(sheet.order) || run.runId;
  const serial = str(sheet.serial) || run.serial;
  const longDate = str(sheet.long_date);
  const headline = str(sheet.headline) || (sheet.approved ? 'APROBADO' : 'REPROBADO');
  const approved = sheet.approved === true;
  const stamp = str(sheet.stamp) || (approved ? 'OK!' : '—');
  const headlineCls = headlineClass(headline, approved);

  const paramRows = parseRows(sheet.rows);
  const tally = str(sheet.emta_tally) || (paramRows.length ? computeTallyFromRows(paramRows) : '');

  const { dsRows, usRows } = resolveRfChannelRows(sheet, report);
  const physicalRows = parsePhysicalRows(sheet.physical_rows);
  const rfChart = embedRfChartHtml(sheet.rf_chart);

  const hasAnexo = emtaNeedsAnexoPage(dsRows, usRows, sheet.rf_chart, physicalRows);
  const pageCount = hasAnexo ? 2 : 1;
  const summaryLine = buildEmtaSummaryLine(sheet, pageCount);

  const page1 = `
    <div class="cert-main">
      ${renderLabStrip(order)}
      <header class="masthead">
        ${renderBrandBlock('Reporte técnico de certificación CPE — EMTA / DOCSIS', 'tc-cert-emta-main')}
        <div class="meta-block">
          <p class="line"><strong>Orden:</strong> ${escapeHtml(order)}</p>
          <p class="line"><strong>SN:</strong> ${escapeHtml(serial)}</p>
          <p class="date">${escapeHtml(longDate)}</p>
        </div>
      </header>
      <section class="result-block">
        <div>
          <h2>Resultado de certificación</h2>
          <div class="headline ${headlineCls}">${escapeHtml(headline)}</div>
          <p class="summary-line">${escapeHtml(summaryLine)}</p>
        </div>
        <div class="stamp ${approved ? '' : 'fail'}">${escapeHtml(stamp)}</div>
      </section>
      ${renderParamsTable(paramRows, tally)}
      <div class="page-tag">Hoja 1/${pageCount}</div>
    </div>`;

  const page2 = hasAnexo
    ? `
    <div class="cert-anexo">
      ${renderLabStrip(order)}
      <div class="anexo-head">
        <h1>TECHCORP — Anexo RF</h1>
        <p>Orden: ${escapeHtml(order)} · Hoja 2/${pageCount}</p>
      </div>
      ${renderEmtaRfAnexoSection(dsRows, usRows)}
      ${rfChart}
      ${renderPhysicalTable(physicalRows)}
      <footer class="doc-footer">
        Documento generado por TECHCORP. © ${new Date().getFullYear()} TECHCORP. Todos los derechos reservados. · www.techcorpca.com · Hoja 2/2
        <div class="legend-note">${escapeHtml(EMTA_PHYSICAL_LEGEND)}</div>
      </footer>
    </div>`
    : '';

  return page1 + page2;
}

function renderOntCertificate(run: OntRun, sheet: CertificateSheet): string {
  const order = str(sheet.order) || run.runId;
  const serial = str(sheet.serial) || run.serial;
  const longDate = str(sheet.long_date);
  const headline = str(sheet.headline_cpe) || str(sheet.headline) || (sheet.approved ? 'CERTIFICADO' : 'NO CERTIFICADO');
  const approved = sheet.approved === true;
  const stamp = str(sheet.stamp) || (approved ? 'OK!' : '—');
  const headlineCls = headlineClass(headline, approved);

  const paramRows = parseRows(sheet.cpe_rows);
  const tally = str(sheet.tally) || (paramRows.length ? computeTallyFromRows(paramRows) : '');

  const physicalRows = parsePhysicalRows(sheet.physical_rows);
  const opticalChart = embedChartHtml(sheet.optical_chart);
  const hasAnexo = opticalChart || physicalRows.length > 0;

  const summaryParts = [str(sheet.short_stamp), str(sheet.summary)].filter(Boolean).join(' · ');

  const page1 = `
    <div class="cert-main">
      ${renderLabStrip(order)}
      <header class="masthead">
        ${renderBrandBlock('Reporte técnico de certificación CPE — ONT / GPON', 'tc-cert-ont-main')}
        <div class="meta-block">
          <p class="line"><strong>Orden:</strong> ${escapeHtml(order)}</p>
          <p class="line"><strong>SN:</strong> ${escapeHtml(serial)}</p>
          <p class="date">${escapeHtml(longDate)}</p>
        </div>
      </header>
      <section class="result-block">
        <div>
          <h2>Resultado de certificación</h2>
          <div class="headline ${headlineCls}">${escapeHtml(headline)}</div>
          <p class="summary-line">${escapeHtml(summaryParts)}${summaryParts ? ' · ' : ''}Hoja 1/${hasAnexo ? '2' : '1'}</p>
        </div>
        <div class="stamp ${approved ? '' : 'fail'}">${escapeHtml(stamp)}</div>
      </section>
      ${renderParamsTable(paramRows, tally)}
      <div class="page-tag">Hoja 1/${hasAnexo ? '2' : '1'}</div>
    </div>`;

  const page2 = hasAnexo
    ? `
    <div class="cert-anexo">
      ${renderLabStrip(order)}
      <div class="anexo-head">
        <h1>TECHCORP — Anexo óptico</h1>
        <p>Orden: ${escapeHtml(order)} · Hoja 2/2</p>
      </div>
      ${opticalChart}
      ${renderPhysicalTable(physicalRows)}
      <footer class="doc-footer">
        Documento generado por TECHCORP · © ${new Date().getFullYear()} TECHCORP · Todos los derechos reservados · www.techcorpca.com · Hoja 2/2
      </footer>
    </div>`
    : '';

  return page1 + page2;
}

/** HTML alineado al certificado del lab (EMTA ≠ ONT) cuando existe certificate_sheet. */
export function renderCertificateSheetHtml(run: OntRun): string {
  const report = run.reportJson;
  if (!report || !isPlainObject(report)) return '';
  const sheet = report.certificate_sheet;
  if (!sheet || !isPlainObject(sheet)) return '';

  const profile = resolveSheetProfile(run, sheet);
  const hasContent =
    (profile === 'emta' && Array.isArray(sheet.rows) && sheet.rows.length > 0) ||
    (profile === 'ont' && Array.isArray(sheet.cpe_rows) && sheet.cpe_rows.length > 0) ||
    (Array.isArray(sheet.physical_rows) && sheet.physical_rows.length > 0) ||
    str(sheet.rf_chart) ||
    str(sheet.optical_chart) ||
    (Array.isArray(sheet.ds_rows) && sheet.ds_rows.length > 0);

  if (!hasContent) return '';

  const body =
    profile === 'ont' ? renderOntCertificate(run, sheet) : renderEmtaCertificate(run, sheet, report);

  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/>
    <title>${escapeHtml(str(sheet.order) || run.runId)} — TECHCORP LAB</title>
    <style>${SHEET_STYLES}</style></head><body><div class="page">${body}</div></body></html>`;
}
