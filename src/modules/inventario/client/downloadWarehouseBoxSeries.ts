import { notify } from '@/components/ui';

export type WarehouseBoxSeriesExportRow = {
  fechaHora?: string | null;
  timestamp?: string | null;
  guia?: string | null;
  agencia?: string | null;
  piloto?: string | null;
  origen?: string | null;
  recibio?: string | null;
  current_status?: string | null;
  estatusSerie?: string | null;
  ordenServicio?: string | null;
  ingreso?: string | null;
  agenciaCAC?: string | null;
  tecnologia?: string | null;
  tecnologiaLabel?: string | null;
  marca?: string | null;
  marcaLabel?: string | null;
  modelo?: string | null;
  modeloLabel?: string | null;
  sn?: string | null;
  s1?: string | null;
  s2?: string | null;
  s3?: string | null;
  s4?: string | null;
  material?: string | null;
  lote?: string | null;
  valuation?: string | null;
};

export type WarehouseBoxExportMeta = {
  boxLabel: string;
  rack?: string | null;
  brandName?: string | null;
  modelName?: string | null;
  techName?: string | null;
  status?: string | null;
};

function safeFilePart(value: string): string {
  return String(value || 'caja')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'caja';
}

function statusLabel(raw: string | null | undefined): string {
  const v = String(raw || '').toLowerCase();
  if (v === 'in_workshop' || v.includes('diagn')) return 'TALLER';
  if (v === 'in_repair' || v.includes('repair')) return 'REPARACIÓN';
  if (v === 'in_qc' || v.includes('qc')) return 'CONTROL CALIDAD';
  if (v === 'ready_to_dispatch' || v.includes('ready')) return 'LISTO';
  if (v === 'in_dispatch_warehouse') return 'BODEGA DESPACHO';
  if (v === 'in_control_warehouse') return 'BODEGA CONTROL';
  return 'BODEGA PRINCIPAL';
}

function resolveName(
  value: string | null | undefined,
  catalog?: Map<string, string>
): string {
  const raw = String(value || '').trim();
  if (!raw) return '---';
  if (catalog?.has(raw)) return catalog.get(raw) || raw;
  return raw;
}

export function buildWarehouseBoxSeriesExcelRows(
  series: WarehouseBoxSeriesExportRow[],
  catalogs?: {
    brands?: Map<string, string>;
    models?: Map<string, string>;
    technologies?: Map<string, string>;
  }
): Record<string, string | number>[] {
  return series.map((item, index) => ({
    '#': index + 1,
    'Fecha / Hora': String(item.fechaHora || item.timestamp || '---'),
    'No. Guía': String(item.guia || item.agencia || '---'),
    Piloto: String(item.piloto || '---'),
    Courier: String(item.origen || '---'),
    Recibió: String(item.recibio || '---'),
    Estatus: statusLabel(item.current_status || item.estatusSerie),
    'Orden Servicio': String(item.ordenServicio || '---'),
    Ingreso: String(item.ingreso || '1° Ingreso'),
    'Agencia CAC': String(item.agenciaCAC || '---'),
    Tecnología:
      String(item.tecnologiaLabel || '').trim() ||
      resolveName(item.tecnologia, catalogs?.technologies),
    Marca:
      String(item.marcaLabel || '').trim() || resolveName(item.marca, catalogs?.brands),
    Modelo:
      String(item.modeloLabel || '').trim() || resolveName(item.modelo, catalogs?.models),
    'S-1': String(item.s1 || item.sn || '---'),
    'S-2': String(item.s2 || '---'),
    'S-3': String(item.s3 || '---'),
    'S-4': String(item.s4 || '---'),
    Material: String(item.material || '---'),
    Valoración: String(item.valuation || item.lote || '---'),
  }));
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Excel con las series (equipos) de una caja de Bodega General.
 * Usa las filas UI ya cargadas en el detalle — mismo universo que la tabla.
 */
export async function downloadWarehouseBoxSeriesExcel(
  series: WarehouseBoxSeriesExportRow[],
  meta: WarehouseBoxExportMeta,
  catalogs?: {
    brands?: Map<string, string>;
    models?: Map<string, string>;
    technologies?: Map<string, string>;
  }
): Promise<void> {
  if (!series.length) {
    notify.warning('Sin series', {
      description: 'La caja no tiene equipos cargados para exportar.',
    });
    return;
  }

  const rows = buildWarehouseBoxSeriesExcelRows(series, catalogs);
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 5 },
    { wch: 18 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 16 },
    { wch: 14 },
    { wch: 12 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 12 },
    { wch: 12 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Series');
  const today = new Date().toISOString().slice(0, 10);
  const file = `Bodega_${safeFilePart(meta.boxLabel)}_series_${today}.xlsx`;
  XLSX.writeFile(wb, file);
  notify.success('Excel descargado', {
    description: `${rows.length} equipo(s) · ${meta.boxLabel}`,
  });
}

/**
 * PDF vía ventana de impresión del navegador (misma estrategia que etiquetas SCRAP).
 */
export function downloadWarehouseBoxSeriesPdf(
  series: WarehouseBoxSeriesExportRow[],
  meta: WarehouseBoxExportMeta,
  catalogs?: {
    brands?: Map<string, string>;
    models?: Map<string, string>;
    technologies?: Map<string, string>;
  }
): void {
  if (!series.length) {
    notify.warning('Sin series', {
      description: 'La caja no tiene equipos cargados para exportar.',
    });
    return;
  }

  const rows = buildWarehouseBoxSeriesExcelRows(series, catalogs);
  const printWindow = window.open('', '', 'width=1024,height=720');
  if (!printWindow) {
    notify.error('No se pudo abrir la ventana de impresión', {
      description: 'Permita ventanas emergentes para generar el PDF.',
    });
    return;
  }

  const bodyRows = rows
    .map(
      (r) => `<tr>
      <td>${escapeHtml(r['#'])}</td>
      <td>${escapeHtml(r['Orden Servicio'])}</td>
      <td>${escapeHtml(r['S-1'])}</td>
      <td>${escapeHtml(r['S-2'])}</td>
      <td>${escapeHtml(r['S-3'])}</td>
      <td>${escapeHtml(r['S-4'])}</td>
      <td>${escapeHtml(r.Tecnología)}</td>
      <td>${escapeHtml(r.Marca)}</td>
      <td>${escapeHtml(r.Modelo)}</td>
      <td>${escapeHtml(r.Estatus)}</td>
      <td>${escapeHtml(r['No. Guía'])}</td>
    </tr>`
    )
    .join('');

  printWindow.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Series ${escapeHtml(meta.boxLabel)}</title>
  <style>
    body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 24px; font-size: 11px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .meta { color: #64748b; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    @media print {
      body { margin: 8mm; }
      @page { size: landscape; margin: 8mm; }
    }
  </style>
</head>
<body>
  <h1>Bodega General · Series de caja</h1>
  <div class="meta">
    <strong>${escapeHtml(meta.boxLabel)}</strong>
    · ${escapeHtml(meta.brandName || '—')} / ${escapeHtml(meta.modelName || '—')}
    · Tech: ${escapeHtml(meta.techName || '—')}
    · Rack: ${escapeHtml(meta.rack || '—')}
    · Estatus: ${escapeHtml(meta.status || '—')}
    · Equipos: ${rows.length}
    · ${escapeHtml(new Date().toLocaleString('es-GT'))}
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>OS</th><th>S-1</th><th>S-2</th><th>S-3</th><th>S-4</th>
        <th>Tech</th><th>Marca</th><th>Modelo</th><th>Estatus</th><th>Guía</th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <script>
    window.onload = function () {
      setTimeout(function () { window.print(); }, 200);
    };
  </script>
</body>
</html>`);
  printWindow.document.close();
  notify.success('PDF listo para imprimir/guardar', {
    description: `${rows.length} equipo(s) · ${meta.boxLabel}`,
  });
}
