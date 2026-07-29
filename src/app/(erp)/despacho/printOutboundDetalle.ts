/** Imprime el Detalle / Conduce de Outbound — layout foto referencia. */

export type OutboundDetalleRow = {
  outboundCode: string;
  brandName?: string;
  modelName?: string;
  techName?: string;
  cantidad: number;
  material?: string;
  valuation?: string;
  fechaSalida?: string;
  /** Series primarias del equipo (S1 / SN). Se muestran en conduce individual. */
  series?: string[];
};

export type OutboundDetalleMeta = {
  fechaSalida?: string;
  numeroSalida?: string;
  trasladoSap?: string;
  notaEntrega?: string;
  destino?: string;
  origen?: string;
  /** Conduce individual: muestra columna Series. */
  includeSeries?: boolean;
};

const escapeHtml = (s: string) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function valoracionBadge(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return `<span class="badge badge-muted">—</span>`;
  if (/novalorad|no\s*valorad/i.test(s)) {
    return `<span class="badge badge-noval">No Valorado</span>`;
  }
  if (/valorado/i.test(s)) {
    return `<span class="badge badge-val">Valorado</span>`;
  }
  return `<span class="badge badge-muted">${escapeHtml(s)}</span>`;
}

function valoracionKind(raw: unknown): 'val' | 'noval' | 'otro' {
  const s = String(raw ?? '').trim();
  if (!s) return 'otro';
  if (/novalorad|no\s*valorad/i.test(s)) return 'noval';
  if (/valorado/i.test(s)) return 'val';
  return 'otro';
}

function formatFechaSalida(d = new Date()): string {
  return d.toLocaleString('es-PA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function printOutboundDetalle(
  rows: OutboundDetalleRow[],
  meta: OutboundDetalleMeta = {}
): Promise<void> {
  if (!rows.length) return;

  const fechaSalida = meta.fechaSalida || formatFechaSalida();
  const ns = String(meta.numeroSalida || '').trim() || '—';
  const traslado = String(meta.trasladoSap || '').trim() || '—';
  const nota = String(meta.notaEntrega || '').trim() || '—';
  const origen = String(meta.origen || 'Tech Corps Guatemala S.A.').trim() || 'Tech Corps Guatemala S.A.';
  const destino = String(meta.destino || '').trim() || '—';
  const includeSeries =
    meta.includeSeries === true ||
    rows.some((r) => Array.isArray(r.series) && r.series.some((s) => String(s || '').trim()));

  let totalEquipos = 0;
  let totalValorados = 0;
  let totalNoValorados = 0;

  const bodyRows = rows
    .map((r) => {
      const digits = String(r.outboundCode).replace(/\D/g, '') || r.outboundCode;
      const outboundNum = String(digits).padStart(6, '0');
      const qty = Number(r.cantidad) || 0;
      totalEquipos += qty;
      const kind = valoracionKind(r.valuation);
      if (kind === 'val') totalValorados += qty;
      else if (kind === 'noval') totalNoValorados += qty;
      const seriesHtml = (r.series || [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .map((s) => escapeHtml(s))
        .join('<br/>');
      return `
        <tr>
          <td class="mono">${escapeHtml(outboundNum)}</td>
          ${includeSeries ? `<td class="mono series-cell">${seriesHtml || '—'}</td>` : ''}
          <td>${escapeHtml(r.brandName || '—')}</td>
          <td>${escapeHtml(r.modelName || '—')}</td>
          <td>${escapeHtml(r.techName || '—')}</td>
          <td class="num">${qty}</td>
          <td class="mono">${escapeHtml(r.material || '—')}</td>
          <td>${valoracionBadge(r.valuation)}</td>
        </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Conduce ${escapeHtml(ns)} · Tech Corps Guatemala S.A.</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 186mm; /* A4 portrait usable width */
      max-width: 186mm;
      background: #fff;
      color: #181c3a;
      font-family: Arial, Helvetica, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .sheet {
      width: 186mm;
      max-width: 186mm;
    }

    .brand {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 8px;
      padding: 0 2px;
    }
    .brand-name {
      font-size: 13pt;
      font-weight: 900;
      color: #181c3a;
      letter-spacing: 0.02em;
    }
    .brand-sub {
      font-size: 8.5pt;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      background: #181c3a;
      color: #fff;
      border-radius: 12px;
      padding: 12px 18px;
      margin-bottom: 12px;
    }
    .topbar h1 {
      margin: 0;
      font-size: 11pt;
      font-weight: 900;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      line-height: 1.25;
    }
    .fecha-wrap {
      text-align: right;
      flex-shrink: 0;
    }
    .fecha-wrap .lbl {
      display: block;
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.7);
      margin-bottom: 4px;
    }
    .fecha-pill {
      display: inline-block;
      background: #f1f5f9;
      color: #181c3a;
      font-size: 10pt;
      font-weight: 800;
      padding: 6px 12px;
      border-radius: 999px;
      white-space: nowrap;
    }

    .cards-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 10px;
    }
    .card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 10px 12px;
    }
    .card .lbl {
      display: block;
      font-size: 7.5pt;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 3px;
    }
    .card .val {
      font-size: 11pt;
      font-weight: 900;
      color: #181c3a;
      font-family: Consolas, "Courier New", monospace;
      word-break: break-all;
    }

    .route {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 12px;
    }
    .route-box {
      background: #eef8fc;
      border-radius: 12px;
      padding: 10px 14px;
      border-left: 4px solid #2ec4f1;
    }
    .route-box .lbl {
      display: block;
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 4px;
    }
    .route-box .val {
      font-size: 12pt;
      font-weight: 900;
      color: #181c3a;
    }

    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      margin-bottom: 12px;
    }
    thead th {
      background: #181c3a;
      color: #fff;
      font-size: 7pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      text-align: left;
      padding: 8px 6px;
    }
    tbody td {
      font-size: 8.5pt;
      font-weight: 700;
      padding: 8px 6px;
      border-bottom: 1px solid #f1f5f9;
      color: #181c3a;
      background: #fff;
    }
    tbody tr:last-child td { border-bottom: none; }
    .mono { font-family: Consolas, "Courier New", monospace; }
    .series-cell { font-size: 8pt; line-height: 1.35; word-break: break-all; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }

    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 8.5pt;
      font-weight: 900;
    }
    .badge-noval { background: #fee2e2; color: #b91c1c; }
    .badge-val { background: #d1fae5; color: #047857; }
    .badge-muted { background: #f1f5f9; color: #64748b; }

    .summary {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .sum-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 10px 14px;
    }
    .sum-card .lbl {
      display: block;
      font-size: 8pt;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #94a3b8;
      margin-bottom: 4px;
    }
    .sum-card .val {
      font-size: 16pt;
      font-weight: 900;
      color: #181c3a;
    }
    .sum-card.valorado .val { color: #047857; }
    .sum-card.novalorado .val { color: #b91c1c; }

    .footer {
      text-align: center;
      font-size: 8pt;
      font-weight: 600;
      color: #94a3b8;
    }

    @media print {
      html, body, .sheet {
        width: 186mm !important;
        max-width: 186mm !important;
      }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="brand">
      <div class="brand-name">Tech Corps Guatemala S.A.</div>
      <div class="brand-sub">Outbound / Conduce de salida</div>
    </div>

    <div class="topbar">
      <h1>Detalle de Outbound / Conduce</h1>
      <div class="fecha-wrap">
        <span class="lbl">Fecha de salida</span>
        <span class="fecha-pill">${escapeHtml(fechaSalida)}</span>
      </div>
    </div>

    <div class="cards-3">
      <div class="card">
        <span class="lbl">Número de salida</span>
        <span class="val">${escapeHtml(ns)}</span>
      </div>
      <div class="card">
        <span class="lbl">Traslado SAP</span>
        <span class="val">${escapeHtml(traslado)}</span>
      </div>
      <div class="card">
        <span class="lbl">Nota de Entrega</span>
        <span class="val">${escapeHtml(nota)}</span>
      </div>
    </div>

    <div class="route">
      <div class="route-box">
        <span class="lbl">Origen</span>
        <span class="val">${escapeHtml(origen)}</span>
      </div>
      <div class="route-box">
        <span class="lbl">Destino</span>
        <span class="val">${escapeHtml(destino)}</span>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Outbound</th>
          ${includeSeries ? '<th>Series</th>' : ''}
          <th>Marca</th>
          <th>Modelo</th>
          <th>Tecnología</th>
          <th>Cantidad</th>
          <th>Material</th>
          <th>Valoración</th>
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>

    <div class="summary">
      <div class="sum-card">
        <span class="lbl">Total Outbound</span>
        <span class="val">${rows.length}</span>
      </div>
      <div class="sum-card">
        <span class="lbl">Total equipos</span>
        <span class="val">${totalEquipos}</span>
      </div>
      <div class="sum-card valorado">
        <span class="lbl">Valorados</span>
        <span class="val">${totalValorados}</span>
      </div>
      <div class="sum-card novalorado">
        <span class="lbl">No valorados</span>
        <span class="val">${totalNoValorados}</span>
      </div>
    </div>

    <div class="footer">
      Tech Corps Guatemala S.A. · Documento generado automáticamente · Sistema de Outbound / Conduce
    </div>
  </div>
</body>
</html>`;

  const iframeId = 'tc-erp-outbound-detalle-print-frame';
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
  if (!doc) return;

  doc.open();
  doc.write(html);
  doc.close();

  const win = iframe.contentWindow;
  if (!win) return;

  await new Promise((r) => setTimeout(r, 150));
  win.focus();
  win.print();

  setTimeout(() => {
    iframe?.remove();
  }, 60_000);
}
