/**
 * Etiqueta KAON QC — mismo diseño que la sticker de referencia:
 * Wi‑Fi (2.4G / 5G / WI-FI) + MODELO/KAON | SERIAL / CM MAC / MTA MAC (CODE128).
 */

import { catalogModelKey } from '@/shared/catalogs/normalizeCatalogName';

export type KaonQcLabelInput = {
  modelo: string;
  marca?: string;
  sn?: string;
  all_sns?: string[];
};

type PrintCallbacks = {
  onEmpty?: () => void;
  onUnsupportedModel?: () => void;
  onBarcodeError?: () => void;
};

const escapeHtml = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function isMacAddress(raw: string): boolean {
  const hex = raw.replace(/[:\-\s]/g, '');
  return /^[0-9A-Fa-f]{12}$/.test(hex);
}

function normalizeMac(raw: string): string {
  return raw.replace(/[:\-\s]/g, '').toUpperCase();
}

/** CG-2200 → CG2200 (como en la sticker física). */
export function formatKaonStickerModel(modelo: string, marca?: string): string {
  const key = catalogModelKey(modelo, marca) || String(modelo || '').toUpperCase();
  if (key === 'CG-2200' || key === 'CG2200') return 'CG2200';
  if (key === 'CG-3000' || key === 'CG3000') return 'CG3000';
  return String(modelo || '').replace(/-/g, '').toUpperCase() || '—';
}

export function isKaonQcPrintableModel(modelo: string, marca?: string): boolean {
  const key = catalogModelKey(modelo, marca);
  return key === 'CG-2200' || key === 'CG-3000' || key === 'CG2200' || key === 'CG3000';
}

/**
 * Orden típico sticker KAON (MACs hex ordenados):
 * CM (menor) → WAN → MTA (mayor). SSIDs = últimos 6 del WAN.
 */
export function resolveKaonLabelIds(allSns: string[], fallbackSn?: string) {
  const sns = [...(allSns || [])].map((s) => String(s || '').trim()).filter(Boolean);
  const macs = sns.filter(isMacAddress).map(normalizeMac).sort((a, b) => a.localeCompare(b));
  const serials = sns.filter((s) => !isMacAddress(s));
  const serial =
    serials.sort((a, b) => b.length - a.length || a.localeCompare(b))[0] ||
    String(fallbackSn || '').trim() ||
    '';

  const cmMac = macs[0] || '';
  const wanMac = macs[1] || '';
  const mtaMac = macs[2] || '';
  const wanSuffix = wanMac.slice(-6);
  const ssid24 = wanSuffix ? `CLARO1_${wanSuffix}` : '';
  const ssid5 = wanSuffix ? `CLARO2_${wanSuffix}` : '';

  return { serial, cmMac, mtaMac, wanMac, ssid24, ssid5 };
}

/** Tamaño de la sticker de referencia (~90×55 mm). */
const LABEL_CSS = `
  @page { size: 90mm 55mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 90mm;
    height: 55mm;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .label {
    width: 90mm;
    height: 55mm;
    padding: 2.8mm 3.2mm 2.4mm;
    display: flex;
    flex-direction: column;
    gap: 2mm;
    overflow: hidden;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 4mm;
  }
  .wifi-block {
    flex: 1;
    min-width: 0;
  }
  .wifi-block .line {
    font-size: 9px;
    font-weight: 700;
    line-height: 1.35;
    white-space: nowrap;
  }
  .model-block {
    text-align: right;
    line-height: 1.05;
    flex-shrink: 0;
  }
  .model-block .lbl {
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .model-block .name {
    font-size: 22px;
    font-weight: 900;
    letter-spacing: 0.01em;
  }
  .model-block .brand {
    margin-top: 0.4mm;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .ids {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
    gap: 1.2mm;
  }
  .row {
    display: grid;
    grid-template-columns: 15mm 1fr;
    align-items: center;
    column-gap: 2mm;
  }
  .tag {
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  .bc-wrap {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .bc {
    width: 100%;
    height: 8mm;
    max-width: 62mm;
  }
  .bc-text {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.05em;
    margin-top: 0.4mm;
    text-align: center;
  }
`;

function buildLabelHtml(
  opts: {
    stickerModel: string;
    brand: string;
    serial: string;
    cmMac: string;
    mtaMac: string;
    ssid24: string;
    ssid5: string;
  },
  barcodeBlock: (value: string) => string
): string {
  // Mismo orden y campos que la etiqueta de referencia compartida.
  const rows: Array<{ tag: string; value: string }> = [
    { tag: 'SERIAL', value: opts.serial },
    { tag: 'CM MAC', value: opts.cmMac },
    { tag: 'MTA MAC', value: opts.mtaMac },
  ].filter((r) => r.value);

  const brand = (opts.brand || 'KAON').toUpperCase().replace(/BROADBAND/i, '').trim() || 'KAON';

  return `
  <div class="label">
    <div class="top">
      <div class="wifi-block">
        <div class="line">2.4G ${escapeHtml(opts.ssid24 || '—')}</div>
        <div class="line">5G ${escapeHtml(opts.ssid5 || '—')}</div>
        <div class="line">WI-FI (ver equipo / sistema)</div>
      </div>
      <div class="model-block">
        <div class="lbl">MODELO</div>
        <div class="name">${escapeHtml(opts.stickerModel)}</div>
        <div class="brand">${escapeHtml(brand)}</div>
      </div>
    </div>
    <div class="ids">
      ${rows
        .map(
          (r) => `
        <div class="row">
          <div class="tag">${escapeHtml(r.tag)}</div>
          ${barcodeBlock(r.value)}
        </div>`
        )
        .join('')}
    </div>
  </div>`;
}

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

  const iframeId = 'tc-erp-kaon-qc-print-frame';
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

  await new Promise((r) => setTimeout(r, 220));
  win.focus();
  win.print();

  setTimeout(() => {
    iframe?.remove();
  }, 60_000);
}

export async function printKaonQcLabel(
  input: KaonQcLabelInput,
  callbacks?: PrintCallbacks
): Promise<void> {
  const { onEmpty, onUnsupportedModel, onBarcodeError } = callbacks || {};

  if (!isKaonQcPrintableModel(input.modelo, input.marca)) {
    onUnsupportedModel?.();
    return;
  }

  const ids = resolveKaonLabelIds(input.all_sns || [], input.sn);
  if (!ids.serial && !ids.cmMac && !ids.mtaMac && !ids.wanMac) {
    onEmpty?.();
    return;
  }

  let JsBarcode: { default: (el: SVGElement, value: string, opts: Record<string, unknown>) => void };
  try {
    JsBarcode = await import('jsbarcode');
  } catch {
    onBarcodeError?.();
    return;
  }

  const barcodeBlock = (value: string) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    try {
      JsBarcode.default(svg, raw, {
        format: 'CODE128',
        displayValue: false,
        margin: 0,
        width: 1.45,
        height: 30,
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

  const stickerModel = formatKaonStickerModel(input.modelo, input.marca);
  const body = buildLabelHtml(
    {
      stickerModel,
      brand: String(input.marca || 'KAON'),
      ...ids,
    },
    barcodeBlock
  );

  await runPrintDocument(`Label ${stickerModel}`, body, onBarcodeError);
}
