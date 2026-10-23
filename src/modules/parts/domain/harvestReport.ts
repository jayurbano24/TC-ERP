export type HarvestReportRow = {
  id: string;
  case_id?: string | null;
  created_at?: string | null;
  created_by_name?: string | null;
  os_label?: string | null;
  serial_number?: string | null;
  donor_status?: string | null;
  brand_name?: string | null;
  model_name?: string | null;
  technology_name?: string | null;
  notes?: string | null;
  lines?: Array<{ qty?: number; notes?: string | null; catalog?: { sku?: string | null; name?: string | null } | null }>;
};

export type BoomHvRow = {
  id: string;
  caseId: string;
  createdAt: string | null;
  operator: string | null;
  os: string | null;
  serial: string | null;
  brand: string;
  model: string;
  technology: string;
  sku: string;
  part: string;
  quantity: number;
  lineNotes: string | null;
  caseNotes: string | null;
};

function csv(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildHarvestReportCsv(rows: HarvestReportRow[]): string {
  const output = ['Caso,Fecha,Operador,OS donante,Serie donante,Marca,Modelo,Tecnologia,SKU,Pieza,Cantidad,Nota de pieza,Notas del caso'];
  for (const row of flattenBoomHvRows(rows)) {
    output.push([
      row.caseId, row.createdAt, row.operator, row.os, row.serial, row.brand, row.model,
      row.technology, row.sku, row.part, row.quantity, row.lineNotes, row.caseNotes,
    ].map(csv).join(','));
  }
  return `\uFEFF${output.join('\r\n')}`;
}

export function flattenBoomHvRows(rows: HarvestReportRow[]): BoomHvRow[] {
  return rows.flatMap((row) => (row.lines ?? []).map((line, index) => ({
    id: `${row.id}:${index}`,
    caseId: row.case_id || row.id,
    createdAt: row.created_at ?? null,
    operator: row.created_by_name ?? null,
    os: row.os_label ?? null,
    serial: row.serial_number ?? null,
    brand: row.brand_name || '—',
    model: row.model_name || '—',
    technology: row.technology_name || '—',
    sku: line.catalog?.sku || '—',
    part: line.catalog?.name || '—',
    quantity: Number(line.qty ?? 0),
    lineNotes: line.notes ?? null,
    caseNotes: row.notes ?? null,
  })));
}

export function buildBoomHvExcelRows(rows: HarvestReportRow[]) {
  return flattenBoomHvRows(rows).map((row) => ({
    Fecha: row.createdAt ? new Date(row.createdAt).toLocaleString('es-GT') : '',
    Caso: row.caseId,
    Operador: row.operator || '',
    'OS donante': row.os || '',
    'Serie donante': row.serial || '',
    Marca: row.brand,
    Modelo: row.model,
    Tecnologia: row.technology,
    SKU: row.sku,
    'Pieza retirada': row.part,
    Cantidad: row.quantity,
    'Nota de pieza': row.lineNotes || '',
    'Notas del caso': row.caseNotes || '',
  }));
}
