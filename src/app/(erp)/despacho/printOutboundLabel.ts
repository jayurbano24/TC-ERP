import { tcTechcorpLogoPrintHtml } from '@/lib/brand/tcTechcorpLogoPrintHtml';

/** Etiqueta outbound — altura de página según filas; meta + S1–S4 con barcodes. */

export type OutboundLabelInput = {
  outboundCode: string;
  brandName: string;
  modelName: string;
  techName: string;
  capacity: number;
  boxMaterial?: string;
  boxValuation?: string;
  items: Array<{
    s1?: string;
    s2?: string;
    s3?: string;
    s4?: string;
    serial_number?: string;
    material?: string;
    valuation?: string;
  }>;
};

type PrintCallbacks = {
  onEmpty?: () => void;
  onBarcodeError?: () => void;
};

type BarcodeRenderer = (value: string, slot: 's1' | 's2' | 's3' | 's4') => string;

type LabelMetrics = {
  pageWidthMm: number;
  pageHeightMm: number;
  bcFrameMm: number;
  rowMarginMm: number;
  barHeightPx: number;
  headFontPt: number;
  metaFontPt: number;
};

const escapeHtml = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Nombre sugerido al guardar PDF desde impresión (p. ej. Outbound: 000064 OB-000064). */
export function formatOutboundLabelDocumentTitle(outboundCode: string): string {
  const raw = String(outboundCode || '').trim();
  const m = raw.match(/^OB-(\d+)$/i);
  const num = m ? m[1].padStart(6, '0') : raw.replace(/\D/g, '').padStart(6, '0') || '000000';
  const code = m ? `OB-${m[1].padStart(6, '0')}` : raw.toUpperCase();
  return `Outbound: ${num} ${code}`;
}

function formatValoracion(raw: string): string {
  const t = String(raw || '').trim();
  if (!t) return '—';
  if (/novalorad|no\s*valorad/i.test(t)) return 'NO VALORADO';
  if (/^valorado$/i.test(t) || (/valorado/i.test(t) && !/no/i.test(t))) return 'VALORADO';
  return t.toUpperCase();
}

function itemSlots(item: OutboundLabelInput['items'][number]): [string, string, string, string] {
  return [
    String(item.s1 || item.serial_number || '').trim(),
    String(item.s2 || '').trim(),
    String(item.s3 || '').trim(),
    String(item.s4 || '').trim(),
  ];
}

/** Calcula tamaño de hoja TSC / PDF para que no se recorten filas (9+ equipos). */
export function computeOutboundLabelMetrics(rowCount: number): LabelMetrics {
  const rows = Math.max(1, rowCount);
  const headerMm = 34;

  if (rows <= 5) {
    return {
      pageWidthMm: 150,
      pageHeightMm: 100,
      bcFrameMm: 7,
      rowMarginMm: 0.85,
      barHeightPx: 28,
      headFontPt: 13,
      metaFontPt: 8.5,
    };
  }

  if (rows <= 8) {
    const rowMm = 9.4;
    return {
      pageWidthMm: 150,
      pageHeightMm: Math.min(280, Math.ceil(headerMm + rows * rowMm + 8)),
      bcFrameMm: 5.8,
      rowMarginMm: 0.45,
      barHeightPx: 22,
      headFontPt: 12,
      metaFontPt: 8,
    };
  }

  const rowMm = 8.6;
  return {
    pageWidthMm: 150,
    pageHeightMm: Math.min(297, Math.ceil(headerMm + rows * rowMm + 10)),
    bcFrameMm: 5,
    rowMarginMm: 0.35,
    barHeightPx: 18,
    headFontPt: 11,
    metaFontPt: 7.5,
  };
}

function buildLabelCss(metrics: LabelMetrics): string {
  const { pageWidthMm, pageHeightMm, bcFrameMm, rowMarginMm, headFontPt, metaFontPt } = metrics;
  return `
    @page { size: ${pageWidthMm}mm ${pageHeightMm}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: ${pageWidthMm}mm;
      min-height: ${pageHeightMm}mm;
      height: auto;
      overflow: visible;
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label {
      width: ${pageWidthMm}mm;
      min-height: ${pageHeightMm}mm;
      height: auto;
      padding: 2.5mm 3mm 3mm 3mm;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      overflow: visible;
    }
    .label:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    .brand-bar {
      display: flex;
      align-items: center;
      gap: 2.5mm;
      padding-bottom: 1mm;
      margin-bottom: 0.8mm;
      flex-shrink: 0;
    }
    .brand-logo { height: 6.5mm; width: auto; flex-shrink: 0; }
    .brand-name {
      font-size: 12pt;
      font-weight: 900;
      letter-spacing: 1px;
      color: #2e3165;
      text-transform: uppercase;
      line-height: 1;
    }

    .head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-bottom: 1mm;
      border-bottom: 1pt solid #000;
      flex-shrink: 0;
    }
    .head-left {
      font-size: ${headFontPt}pt;
      font-weight: 900;
      color: #0b1a3a;
    }
    .head-right {
      font-size: ${Math.max(9, headFontPt - 2)}pt;
      font-weight: 700;
      color: #0b1a3a;
    }

    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 3mm;
      row-gap: 0.45mm;
      padding: 1.2mm 0 1mm 0;
      border-bottom: 1pt solid #000;
      font-size: ${metaFontPt}pt;
      font-weight: 700;
      line-height: 1.2;
      color: #0b1a3a;
      flex-shrink: 0;
    }
    .meta-k {
      color: #475569;
      font-weight: 800;
      margin-right: 1mm;
    }
    .meta-wide { grid-column: 1 / -1; }

    .series-table {
      flex: 1 1 auto;
      margin-top: 1mm;
      overflow: visible;
    }
    .series-head,
    .series-row {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      column-gap: 1.2mm;
      align-items: end;
    }
    .series-head {
      font-size: 6.5pt;
      font-weight: 800;
      color: #64748b;
      text-transform: uppercase;
      padding-bottom: 0.5mm;
      margin-bottom: 0.6mm;
      border-bottom: 0.5pt solid #94a3b8;
    }
    .series-row { margin-bottom: ${rowMarginMm}mm; }
    .series-cell { min-width: 0; overflow: visible; }
    .series-empty { padding-bottom: 1.5mm; }
    .series-dash { font-size: 8pt; color: #cbd5e1; }

    .bc-wrap { width: 100%; max-width: 35mm; text-align: left; }
    .bc-frame {
      height: ${bcFrameMm}mm;
      min-height: ${bcFrameMm}mm;
      display: flex;
      align-items: flex-end;
      overflow: visible;
    }
    .bc-wrap .bc {
      display: block;
      height: 100%;
      width: auto;
      max-width: 100%;
      flex-shrink: 0;
    }
    .bc-text {
      margin-top: 0.25mm;
      font-size: 5.5pt;
      font-weight: 700;
      font-family: Consolas, "Courier New", monospace;
      color: #334155;
      line-height: 1.05;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 35mm;
    }
    .bc-text.slot-s1 { color: #047857; font-weight: 800; }
  `;
}

function buildLabelHtml(opts: OutboundLabelInput, barcodeBlock: BarcodeRenderer): string | null {
  const {
    outboundCode,
    brandName,
    modelName,
    techName,
    capacity,
    boxMaterial,
    boxValuation,
    items,
  } = opts;

  const filled = items.filter((s) => itemSlots(s)[0]);
  if (!filled.length) return null;

  const qty = Math.max(Number(capacity) || filled.length, filled.length);
  const digits = String(outboundCode).replace(/\D/g, '') || '0';
  const outboundNum = digits.padStart(6, '0');

  const materialLabel =
    String(boxMaterial || filled[0]?.material || '').trim() || '—';

  const rawVal = String(filled[0]?.valuation || boxValuation || '').trim();
  const valoracionLabel = formatValoracion(rawVal);

  const slotLabels = ['S1 / SN', 'S2', 'S3', 'S4'] as const;
  const headCells = slotLabels.map((l) => `<div class="series-h">${l}</div>`).join('');

  const rows = filled
    .map((item) => {
      const [s1, s2, s3, s4] = itemSlots(item);
      const slots: Array<[string, 's1' | 's2' | 's3' | 's4']> = [
        [s1, 's1'],
        [s2, 's2'],
        [s3, 's3'],
        [s4, 's4'],
      ];
      const cells = slots
        .map(([sn, slot]) => {
          if (!sn) {
            return `<div class="series-cell series-empty"><span class="series-dash">—</span></div>`;
          }
          return `<div class="series-cell">${barcodeBlock(sn, slot)}</div>`;
        })
        .join('');
      return `<div class="series-row">${cells}</div>`;
    })
    .join('');

  return `
  <div class="label" data-rows="${filled.length}">
    ${tcTechcorpLogoPrintHtml()}
    <div class="head">
      <div class="head-left">Outbound: ${outboundNum}</div>
      <div class="head-right">${escapeHtml(outboundCode)}</div>
    </div>

    <div class="meta">
      <div class="meta-line"><span class="meta-k">MARCA:</span> ${escapeHtml(brandName)}</div>
      <div class="meta-line"><span class="meta-k">MODELO:</span> ${escapeHtml(modelName)}</div>
      <div class="meta-line"><span class="meta-k">TECNOLOGÍA:</span> ${escapeHtml(techName)}</div>
      <div class="meta-line"><span class="meta-k">Cantidad:</span> ${filled.length}${qty !== filled.length ? ` / ${qty}` : ''}</div>
      <div class="meta-line meta-wide"><span class="meta-k">Material:</span> ${escapeHtml(materialLabel)}</div>
      <div class="meta-line"><span class="meta-k">Valoración:</span> ${escapeHtml(valoracionLabel)}</div>
    </div>

    <div class="series-table">
      <div class="series-head">${headCells}</div>
      ${rows}
    </div>
  </div>`;
}

function uniformModuleWidth(raw: string, targetPx: number): number {
  const estimatedModules = 106 + raw.length * 11;
  const w = targetPx / estimatedModules;
  return Math.min(1.35, Math.max(0.92, w));
}

const BARCODE_TARGET_WIDTH_PX = 112;
const BARCODE_QUIET_MARGIN = 4;

async function runPrintDocument(
  title: string,
  bodyHtml: string,
  metrics: LabelMetrics,
  onBarcodeError?: () => void
) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${buildLabelCss(metrics)}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  const iframeId = 'tc-erp-outbound-print-frame';
  let iframe = document.getElementById(iframeId) as HTMLIFrameElement | null;
  if (iframe) iframe.remove();

  iframe = document.createElement('iframe');
  iframe.id = iframeId;
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    onBarcodeError?.();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) return;

  try {
    doc.title = title;
    win.document.title = title;
  } catch {
    /* ignore */
  }

  await new Promise((r) => setTimeout(r, 300));
  win.focus();
  win.print();

  setTimeout(() => {
    iframe?.remove();
  }, 60_000);
}

/** Imprime una o varias etiquetas Outbound (hoja TSC ajustada al número de equipos). */
export async function printOutboundLabels(
  labels: OutboundLabelInput[],
  callbacks?: PrintCallbacks
): Promise<void> {
  const { onEmpty, onBarcodeError } = callbacks || {};

  if (!labels.length) {
    onEmpty?.();
    return;
  }

  let JsBarcode: typeof import('jsbarcode').default;
  try {
    JsBarcode = (await import('jsbarcode')).default;
  } catch {
    onBarcodeError?.();
    return;
  }

  const rowCounts = labels.map(
    (label) => label.items.filter((s) => itemSlots(s)[0]).length
  );
  const maxRows = Math.max(0, ...rowCounts);
  const metrics = computeOutboundLabelMetrics(maxRows);

  const parts: string[] = [];

  for (const label of labels) {
    const filledCount = label.items.filter((s) => itemSlots(s)[0]).length;
    if (!filledCount) continue;

    const barcodeBlock: BarcodeRenderer = (value, slot) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
      const moduleW = uniformModuleWidth(raw, BARCODE_TARGET_WIDTH_PX);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      JsBarcode(svg, raw, {
        format: 'CODE128',
        displayValue: false,
          margin: BARCODE_QUIET_MARGIN,
          width: moduleW,
          height: metrics.barHeightPx,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch {
        return `<div class="bc-wrap"><div class="bc-text slot-${slot}">${escapeHtml(raw)}</div></div>`;
    }
    svg.setAttribute('class', 'bc');
      svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    return `
      <div class="bc-wrap">
        <div class="bc-frame">${svg.outerHTML}</div>
        <div class="bc-text slot-${slot}">${escapeHtml(raw)}</div>
      </div>`;
  };

    const html = buildLabelHtml(label, barcodeBlock);
    if (html) parts.push(html);
  }

  if (!parts.length) {
    onEmpty?.();
    return;
  }

  const title =
    parts.length === 1 && labels[0]?.outboundCode
      ? formatOutboundLabelDocumentTitle(labels[0].outboundCode)
      : `Etiquetas Salida (${parts.length})`;

  await runPrintDocument(title, parts.join('\n'), metrics, onBarcodeError);
}

export async function printOutboundLabel(
  opts: OutboundLabelInput & PrintCallbacks
): Promise<void> {
  const { onEmpty, onBarcodeError, ...label } = opts;
  await printOutboundLabels([label], { onEmpty, onBarcodeError });
}
