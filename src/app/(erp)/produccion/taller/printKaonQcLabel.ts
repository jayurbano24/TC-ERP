/**
 * Etiqueta de equipo KAON (QC) — layout aproximado a la sticker física:
 * Modelo, SSIDs derivados del WAN MAC, Serial + CM/MTA/WAN con CODE128.
 */

import { catalogModelKey } from '@/shared/catalogs/normalizeCatalogName';

export const KAON_QC_PRINTABLE_MODELS = new Set(['CG-2200', 'CG-3000']);

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
 * Orden típico en sticker KAON tras ordenar MACs hex:
 * CM (menor) → WAN → MTA (mayor). SSIDs usan los últimos 6 del WAN.
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

const LABEL_CSS = `
  @page { size: 70mm 50mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    width: 70mm;
    background: #fff;
    color: #000;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .label {
    width: 70mm;
    min-height: 48mm;
    padding: 2.5mm 3mm;
    display: flex;
    flex-direction: column;
    gap: 1.2mm;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2mm;
  }
  .wifi {
    font-size: 7px;
    line-height: 1.25;
    font-weight: 700;
  }
  .wifi .k { font-weight: 800; text-transform: uppercase; font-size: 6px; color: #222; }
  .model {
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.02em;
    text-align: right;
    line-height: 1.1;
  }
  .model .lbl { display: block; font-size: 6px; font-weight: 800; letter-spacing: 0.08em; }
  .brand {
    font-size: 7px;
    font-weight: 800;
    text-align: right;
    text-transform: uppercase;
  }
  .ids {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1mm;
    margin-top: 0.5mm;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 1.5mm;
  }
  .tag {
    width: 14mm;
    flex-shrink: 0;
    font-size: 6.5px;
    font-weight: 900;
    text-transform: uppercase;
  }
  .bc-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .bc {
    width: 100%;
    height: 7mm;
    max-width: 48mm;
  }
  .bc-text {
    font-size: 7px;
    font-weight: 800;
    letter-spacing: 0.04em;
    margin-top: 0.2mm;
  }
  .note {
    margin-top: auto;
    font-size: 5.5px;
    color: #444;
    font-weight: 600;
  }
`;

function buildLabelHtml(
  opts: {
    stickerModel: string;
    brand: string;
    serial: string;
    cmMac: string;
    mtaMac: string;
    wanMac: string;
    ssid24: string;
    ssid5: string;
  },
  barcodeBlock: (value: string) => string
): string {
  const rows: Array<{ tag: string; value: string }> = [
    { tag: 'Serial', value: opts.serial },
    { tag: 'CM MAC', value: opts.cmMac },
    { tag: 'MTA MAC', value: opts.mtaMac },
    { tag: 'WAN MAC', value: opts.wanMac },
  ].filter((r) => r.value);

  return `
  <div class="label">
    <div class="top">
      <div class="wifi">
        <div><span class="k">2.4G</span> ${escapeHtml(opts.ssid24 || '—')}</div>
        <div><span class="k">5G</span> ${escapeHtml(opts.ssid5 || '—')}</div>
        <div><span class="k">Wi-Fi</span> (ver equipo / sistema)</div>
      </div>
      <div>
        <div class="model"><span class="lbl">MODELO</span>${escapeHtml(opts.stickerModel)}</div>
        <div class="brand">${escapeHtml(opts.brand || 'KAON')}</div>
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
    <div class="note">TC-ERP · Control de Calidad · Etiqueta equipo</div>
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

  await new Promise((r) => setTimeout(r, 200));
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
        width: 1.35,
        height: 28,
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
      brand: String(input.marca || 'KAON').toUpperCase(),
      ...ids,
    },
    barcodeBlock
  );

  await runPrintDocument(`Label ${stickerModel}`, body, onBarcodeError);
}
