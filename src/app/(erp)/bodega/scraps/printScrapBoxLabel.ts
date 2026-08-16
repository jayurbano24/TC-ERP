/** Impresión de etiqueta / captura de caja SCRAPS — layout BODEGA SCRAPS · ETIQUETA. */

export type ScrapPrintBox = {
  id: string;
  marca?: string;
  modelo?: string;
  tecnologia?: string;
  cantidad?: number | string;
  fechaIngreso?: string;
  series?: Array<{
    s1?: string;
    sn?: string;
    s2?: string;
    s3?: string;
    s4?: string;
    material?: string;
    lote?: string;
  }>;
};

type MaterialQty = { material: string; qty: number };

/** Agrupa equipos por código de material (cantidad por material). */
export function aggregateMaterialsByQty(
  series: ScrapPrintBox['series'] | undefined
): MaterialQty[] {
  const map = new Map<string, number>();
  for (const row of series || []) {
    const mat = String(row.material || '')
      .trim()
      .toUpperCase();
    const key = mat || 'SIN MATERIAL';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .map(([material, qty]) => ({ material, qty }))
    .sort((a, b) => a.material.localeCompare(b.material, 'es'));
}

function materialsTableHtml(materials: MaterialQty[]): string {
  if (materials.length === 0) {
    return `<tr><td colspan="2" style="padding: 8px 6px; color: #64748b; text-align: center;">Sin materiales registrados</td></tr>`;
  }
  return materials
    .map(
      (m, idx) =>
        `<tr style="background:${idx % 2 === 0 ? '#eef6fb' : '#ffffff'};">` +
        `<td style="padding: 7px 8px; text-align: left; font-family: ui-monospace, monospace; font-weight: 700; color: #181c3a;">${escapeHtml(m.material)}</td>` +
        `<td style="padding: 7px 8px; text-align: right; font-weight: 900; color: #181c3a;">${m.qty}</td>` +
        `</tr>`
    )
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printScrapBoxLabel(box: ScrapPrintBox, type: 'simple' | 'master'): void {
  const brandLabel = escapeHtml(box.marca || '—');
  const modelLabel = escapeHtml(box.modelo || '—');
  const boxId = escapeHtml(String(box.id || '').trim());
  const barcodeValue = String(box.id || '').trim().replace(/\s+/g, '');
  const materials = aggregateMaterialsByQty(box.series);
  const totalQty =
    typeof box.cantidad === 'number'
      ? box.cantidad
      : Number(box.cantidad) || materials.reduce((s, m) => s + m.qty, 0) || (box.series || []).length;

  const printWindow = window.open('', '', 'width=480,height=640');
  if (!printWindow) return;

  const commonStyles = `
      <style>
        @page { margin: 8mm; size: auto; }
        * { box-sizing: border-box; }
        body {
          font-family: Inter, Arial, Helvetica, sans-serif;
          margin: 0;
          padding: 16px;
          color: #181c3a;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .label-card {
          width: 100%;
          max-width: 360px;
          margin: 0 auto;
          text-align: center;
        }
        .logo-wrap { display: flex; justify-content: center; margin-bottom: 12px; }
        .badge {
          display: inline-block;
          margin: 0 auto 14px;
          padding: 6px 14px;
          border-radius: 8px;
          background: #ffe4e6;
          color: #be123c;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .box-id {
          font-size: 34px;
          font-weight: 900;
          line-height: 1.1;
          margin: 0 0 6px;
          font-family: ui-monospace, Consolas, monospace;
          letter-spacing: -0.02em;
        }
        .barcode {
          font-family: 'Libre Barcode 39', monospace;
          font-size: 52px;
          line-height: 1;
          font-weight: normal;
          margin: 2px 0 14px;
          color: #181c3a;
        }
        .meta {
          font-size: 16px;
          font-weight: 800;
          line-height: 1.45;
          margin: 0 0 12px;
        }
        .divider {
          height: 2px;
          background: #c7e0f0;
          border: 0;
          margin: 0 0 10px;
        }
        .section-title {
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #7aa7c2;
          text-align: left;
          margin: 0 0 6px;
        }
        .mat-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 14px;
        }
        .mat-table thead th {
          padding: 4px 8px 6px;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #181c3a;
          border-bottom: 2px solid #181c3a;
        }
        .mat-table thead th.cant { text-align: right; }
        .total {
          margin: 12px 0 0;
          text-align: right;
          font-size: 14px;
          font-weight: 900;
          color: #181c3a;
        }
        .master-series { margin-top: 16px; text-align: left; font-size: 10px; font-family: ui-monospace, monospace; }
        .master-series table { width: 100%; border-collapse: collapse; }
        .master-series th, .master-series td { padding: 3px 4px; border-bottom: 1px solid #cbd5e1; text-align: left; }
        @media print {
          body { padding: 0; }
        }
      </style>
      <link href="https://fonts.googleapis.com/css2?family=Libre+Barcode+39&display=swap" rel="stylesheet">
    `;

  const svgLogo = `
      <svg viewBox="0 0 565 280" xmlns="http://www.w3.org/2000/svg" style="height: 48px; width: auto;">
        <rect width="565" height="280" fill="#ffffff"/>
        <g fill="#2e3165"><rect x="8" y="9" width="232" height="60"/><rect x="92" y="9" width="65" height="271"/></g>
        <g fill="#2e3165"><circle cx="425" cy="140" r="140"/><circle cx="425" cy="140" r="85" fill="#ffffff"/><rect x="500" y="100" width="80" height="60" fill="#ffffff"/><circle cx="425" cy="140" r="35" fill="#2e3165"/></g>
      </svg>
    `;

  const materialsBlock = `
        <div class="section-title">Materiales · cantidad</div>
        <table class="mat-table">
          <thead>
            <tr>
              <th>Material</th>
              <th class="cant">Cant.</th>
            </tr>
          </thead>
          <tbody>
            ${materialsTableHtml(materials)}
          </tbody>
        </table>
        <p class="total">TOTAL EQUIPOS: ${totalQty || '—'}</p>
  `;

  const simpleLabelHtml = `
      <div class="label-card">
        <div class="logo-wrap">${svgLogo}</div>
        <div class="badge">Bodega SCRAPS · Etiqueta</div>
        <div class="box-id">${boxId}</div>
        <div class="barcode">*${escapeHtml(barcodeValue)}*</div>
        <div class="meta">
          MARCA: ${brandLabel}<br>
          MODELO: ${modelLabel}
        </div>
        <hr class="divider" />
        ${materialsBlock}
      </div>
    `;

  const masterLabelHtml = `
      <div class="label-card" style="max-width: 520px; text-align: left;">
        <div class="logo-wrap">${svgLogo}</div>
        <div style="text-align: center;">
          <div class="badge">Bodega SCRAPS · Captura de caja</div>
          <div class="box-id" style="font-size: 26px;">${boxId}</div>
          <div class="barcode" style="font-size: 42px;">*${escapeHtml(barcodeValue)}*</div>
        </div>
        <div class="meta" style="font-size: 13px; text-align: center;">
          MARCA: ${brandLabel} &nbsp;|&nbsp; MODELO: ${modelLabel}<br>
          TECNOLOGÍA: ${escapeHtml(box.tecnologia || '—')}
          ${box.fechaIngreso ? `<br>FECHA: ${escapeHtml(box.fechaIngreso)}` : ''}
        </div>
        <hr class="divider" />
        ${materialsBlock}
        <div class="master-series">
          <div class="section-title">Detalle de series</div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>S-1 / SN</th>
                <th>S-2</th>
                <th>S-3</th>
                <th>S-4</th>
                <th>Material</th>
                <th>Lote</th>
              </tr>
            </thead>
            <tbody>
              ${(box.series || [])
                .map(
                  (s, idx) =>
                    '<tr>' +
                    `<td>${idx + 1}</td>` +
                    `<td><strong>${escapeHtml(s.s1 || s.sn || '---')}</strong></td>` +
                    `<td>${escapeHtml(s.s2 || '---')}</td>` +
                    `<td>${escapeHtml(s.s3 || '---')}</td>` +
                    `<td>${escapeHtml(s.s4 || '---')}</td>` +
                    `<td>${escapeHtml(s.material || '---')}</td>` +
                    `<td>${escapeHtml(s.lote || '---')}</td>` +
                    '</tr>'
                )
                .join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

  printWindow.document.write(`
      <html>
        <head>
          <title>Etiqueta SCRAPS - ${boxId}</title>
          ${commonStyles}
        </head>
        <body>
          ${type === 'simple' ? simpleLabelHtml : masterLabelHtml}
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.close();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
  printWindow.document.close();
}
