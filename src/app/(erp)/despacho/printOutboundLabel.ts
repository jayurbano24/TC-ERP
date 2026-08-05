import { tcTechcorpLogoPrintHtml } from '@/lib/brand/tcTechcorpLogoPrintHtml';

/** Etiqueta outbound — una hoja: logo TECHCORP, meta tipo detalle, filas S1–S4 con barcodes. */

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

const escapeHtml = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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
      <div class="meta-line"><span class="meta-k">Cantidad:</span> ${qty}</div>
      <div class="meta-line meta-wide"><span class="meta-k">Material:</span> ${escapeHtml(materialLabel)}</div>
      <div class="meta-line"><span class="meta-k">Valoración:</span> ${escapeHtml(valoracionLabel)}</div>
    </div>

    <div class="series-table">
      <div class="series-head">${headCells}</div>
      ${rows}
    </div>
  </div>`;
}

const LABEL_CSS = `
    @page { size: 150mm 100mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 150mm;
      height: 100mm;
      overflow: hidden;
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label {
      width: 150mm;
      height: 100mm;
      max-height: 100mm;
      padding: 2.5mm 3mm 2mm 3mm;
      page-break-after: always;
      break-after: page;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .label:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    .brand-bar {
      display: flex;
      align-items: center;
      gap: 2.5mm;
      padding-bottom: 1.2mm;
      margin-bottom: 1mm;
      flex-shrink: 0;
    }
    .brand-logo {
      height: 7mm;
      width: auto;
      flex-shrink: 0;
    }
    .brand-name {
      font-size: 13pt;
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
      padding-bottom: 1.2mm;
      border-bottom: 1pt solid #000;
      flex-shrink: 0;
    }
    .head-left {
      font-size: 13pt;
      font-weight: 900;
      color: #0b1a3a;
    }
    .head-right {
      font-size: 10pt;
      font-weight: 700;
      color: #0b1a3a;
    }

    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr;
      column-gap: 3mm;
      row-gap: 0.6mm;
      padding: 1.5mm 0 1.2mm 0;
      border-bottom: 1pt solid #000;
      font-size: 8.5pt;
      font-weight: 700;
      line-height: 1.25;
      color: #0b1a3a;
      flex-shrink: 0;
    }
    .meta-k {
      color: #475569;
      font-weight: 800;
      margin-right: 1mm;
    }
    .meta-wide {
      grid-column: 1 / -1;
    }

    .series-table {
      flex: 1;
      min-height: 0;
      margin-top: 1.2mm;
      overflow: hidden;
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
      letter-spacing: 0.2px;
      padding-bottom: 0.6mm;
      margin-bottom: 0.8mm;
      border-bottom: 0.5pt solid #94a3b8;
      flex-shrink: 0;
    }
    .series-h {
      text-align: left;
    }
    .series-row {
      margin-bottom: 0.9mm;
    }
    .label[data-rows="6"] .series-row,
    .label[data-rows="7"] .series-row,
    .label[data-rows="8"] .series-row,
    .label[data-rows="9"] .series-row {
      margin-bottom: 0.45mm;
    }
    .series-cell {
      min-width: 0;
      overflow: hidden;
    }
    .series-empty {
      padding-bottom: 2mm;
    }
    .series-dash {
      font-size: 8pt;
      color: #cbd5e1;
    }
    .bc-wrap {
      width: 100%;
      max-width: 35mm;
      text-align: left;
    }
    .bc-frame {
      height: 7mm;
      min-height: 7mm;
      max-height: 7mm;
      display: flex;
      align-items: flex-end;
      overflow: hidden;
    }
    .label[data-rows="6"] .bc-frame,
    .label[data-rows="7"] .bc-frame,
    .label[data-rows="8"] .bc-frame,
    .label[data-rows="9"] .bc-frame {
      height: 5.5mm;
      min-height: 5.5mm;
      max-height: 5.5mm;
    }
    .bc-wrap .bc {
      display: block;
      height: 100%;
      width: auto;
      max-width: 100%;
      flex-shrink: 0;
    }
    .bc-text {
      margin-top: 0.35mm;
      font-size: 6pt;
      font-weight: 700;
      font-family: Consolas, "Courier New", monospace;
      letter-spacing: 0;
      color: #334155;
      line-height: 1.05;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 35mm;
      text-align: left;
    }
    .bc-text.slot-s1 {
      color: #047857;
      font-weight: 800;
    }
`;

/** Altura de barras (px) por cantidad de filas — mismo grosor de módulo, sin estirar ancho. */
function barcodeBarHeight(rowCount: number): number {
  if (rowCount <= 5) return 28;
  if (rowCount <= 7) return 22;
  return 18;
}

/** Ajusta el ancho de módulo CODE128 para que el SVG quepa ~igual sin CSS stretch (escaneable). */
function uniformModuleWidth(raw: string, targetPx: number): number {
  const estimatedModules = 106 + raw.length * 11;
  const w = targetPx / estimatedModules;
  return Math.min(1.35, Math.max(0.92, w));
}

const BARCODE_TARGET_WIDTH_PX = 112;
const BARCODE_QUIET_MARGIN = 4;

async function runPrintDocument(title: string, bodyHtml: string, onBarcodeError?: () => void) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>${LABEL_CSS}</style>
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

  await new Promise((r) => setTimeout(r, 250));
  win.focus();
  win.print();

  setTimeout(() => {
    iframe?.remove();
  }, 60_000);
}

/** Imprime una o varias etiquetas Outbound (una página TSC por caja). */
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

  const parts: string[] = [];

  for (const label of labels) {
    const filledCount = label.items.filter((s) => itemSlots(s)[0]).length;
    if (!filledCount) continue;

    const barHeight = barcodeBarHeight(filledCount);

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
          height: barHeight,
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
    parts.length === 1
      ? `Etiqueta Salida ${labels[0]?.outboundCode || ''}`
      : `Etiquetas Salida (${parts.length})`;

  await runPrintDocument(title, parts.join('\n'), onBarcodeError);
}

export async function printOutboundLabel(
  opts: OutboundLabelInput & PrintCallbacks
): Promise<void> {
  const { onEmpty, onBarcodeError, ...label } = opts;
  await printOutboundLabels([label], { onEmpty, onBarcodeError });
}
