/** Etiqueta de salida — layout aprobado:
 *  Outbound: NNNNNN | CS-xxxxxx
 *  2 líneas meta: MARCA/Modelo | Tecnologia/Cantidad | Valorado
 *  Material:
 *  Grilla barcodes + serie (sin S1), pegados a la izquierda
 */

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
    serial_number?: string;
    material?: string;
    valuation?: string;
  }>;
};

type PrintCallbacks = {
  onEmpty?: () => void;
  onBarcodeError?: () => void;
};

const escapeHtml = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function buildLabelHtml(
  opts: OutboundLabelInput,
  barcodeBlock: (value: string) => string
): string | null {
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

  const filled = items.filter((s) => String(s.s1 || s.serial_number || '').trim());
  if (!filled.length) return null;

  const qty = Math.max(Number(capacity) || filled.length, filled.length);
  const digits = String(outboundCode).replace(/\D/g, '') || '0';
  const outboundNum = digits.padStart(6, '0');

  const materialLabel =
    String(boxMaterial || filled[0]?.material || '').trim() || '—';

  const rawVal = String(filled[0]?.valuation || boxValuation || '').trim();
  const isNoVal = /novalorad|no\s*valorad/i.test(rawVal);
  const isVal = /valorado/i.test(rawVal) && !isNoVal;
  const valoracionLabel = isVal ? 'Valorado' : isNoVal || rawVal ? 'No Valorado' : '—';

  const cells = filled
    .map((s) => {
      const sn = String(s.s1 || s.serial_number || '').trim();
      return `<div class="cell">${barcodeBlock(sn)}</div>`;
    })
    .join('');

  return `
  <div class="label">
    <div class="head">
      <div class="head-left">Outbound: ${outboundNum}</div>
      <div class="head-right">${escapeHtml(outboundCode)}</div>
    </div>

    <div class="meta">
      <div>
        <div>MARCA : ${escapeHtml(brandName)}</div>
        <div>Modelo: ${escapeHtml(modelName)}</div>
      </div>
      <div>
        <div>Tecnologia: ${escapeHtml(techName)}</div>
        <div>Cantidad: ${qty}</div>
      </div>
      <div>
        <div>Valorado:</div>
        <div>${escapeHtml(valoracionLabel)}</div>
      </div>
    </div>

    <div class="material-row">
      Material: ${escapeHtml(materialLabel)}
    </div>

    <div class="grid">
      ${cells}
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
      background: #fff;
      color: #000;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .label {
      width: 150mm;
      min-height: 100mm;
      padding: 4mm 5mm 3mm 3mm;
      page-break-after: always;
      break-after: page;
    }
    .label:last-child {
      page-break-after: auto;
      break-after: auto;
    }

    .head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-bottom: 2mm;
      border-bottom: 1.25pt solid #000;
    }
    .head-left {
      font-size: 17pt;
      font-weight: 900;
      color: #0b1a3a;
      letter-spacing: 0.1px;
    }
    .head-right {
      font-size: 12pt;
      font-weight: 700;
      color: #0b1a3a;
    }

    .meta {
      display: grid;
      grid-template-columns: 1fr 1fr 0.85fr;
      column-gap: 4mm;
      padding: 2.8mm 0 2.5mm 0;
      border-bottom: 1.25pt solid #000;
      font-size: 10.5pt;
      font-weight: 700;
      line-height: 1.45;
      color: #0b1a3a;
    }

    .material-row {
      padding: 2.4mm 0 2.2mm 0;
      border-bottom: 1.25pt solid #000;
      margin-bottom: 3.5mm;
      font-size: 10.5pt;
      font-weight: 700;
      color: #0b1a3a;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(3, max-content);
      column-gap: 6mm;
      row-gap: 3mm;
      justify-content: start;
      justify-items: start;
    }
    .cell {
      width: 44mm;
    }
    .bc-wrap {
      text-align: left;
    }
    .bc-wrap .bc {
      display: block;
      width: 44mm;
      height: 12mm;
    }
    .bc-text {
      margin-top: 0.8mm;
      font-size: 9pt;
      font-weight: 800;
      font-family: Consolas, "Courier New", monospace;
      letter-spacing: 0.2px;
      color: #0b1a3a;
      line-height: 1.1;
      white-space: nowrap;
      text-align: left;
    }
`;

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

  await new Promise((r) => setTimeout(r, 200));
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

  let JsBarcode: any;
  try {
    JsBarcode = (await import('jsbarcode')).default;
  } catch {
    onBarcodeError?.();
    return;
  }

  const barcodeBlock = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      JsBarcode(svg, raw, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: 1.6,
        height: 42,
        background: '#ffffff',
        lineColor: '#000000',
      });
    } catch {
      return `<div class="bc-wrap"><div class="bc-text">${escapeHtml(raw)}</div></div>`;
    }
    svg.setAttribute('class', 'bc');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    return `
      <div class="bc-wrap">
        ${svg.outerHTML}
        <div class="bc-text">${escapeHtml(raw)}</div>
      </div>`;
  };

  const parts = labels
    .map((label) => buildLabelHtml(label, barcodeBlock))
    .filter((html): html is string => Boolean(html));

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
