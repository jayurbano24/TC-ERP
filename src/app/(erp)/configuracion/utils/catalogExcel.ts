import { csvRowsToObjects, parseCsvText } from './workshopCatalogCsv';

export type CatalogSheetRow = Record<string, string>;

/** Localiza la fila de encabezados (salta instrucciones y comentarios #). */
export function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row?.length) continue;
    const first = String(row[0] ?? '').trim();
    if (first.startsWith('#')) continue;
    const lower = row.map((c) => String(c ?? '').trim().toLowerCase());
    if (
      lower.includes('nombre') ||
      lower.includes('name') ||
      lower.includes('codigo') ||
      lower.includes('code')
    ) {
      return i;
    }
  }
  return rows.length >= 2 ? 1 : 0;
}

export function sheetRowsToObjects(rows: string[][]): CatalogSheetRow[] {
  if (rows.length < 1) return [];
  const headerIdx = findHeaderRowIndex(rows);
  const headers = rows[headerIdx].map((h) => String(h ?? '').trim().toLowerCase());
  const out: CatalogSheetRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row?.length) continue;
    const obj: CatalogSheetRow = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = String(row[idx] ?? '').trim();
    });
    if (Object.values(obj).some(Boolean)) out.push(obj);
  }
  return out;
}

export async function readCatalogSpreadsheet(file: File): Promise<CatalogSheetRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv')) {
    const text = await file.text();
    return csvRowsToObjects(parseCsvText(text));
  }
  const buffer = await file.arrayBuffer();
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });
  const rows = matrix.map((row) => row.map((cell) => String(cell ?? '').trim()));
  return sheetRowsToObjects(rows);
}

export async function downloadCatalogExcel(
  filename: string,
  instruction: string,
  headers: string[],
  dataRows: string[][],
): Promise<void> {
  const XLSX = await import('xlsx');
  const sheetData: string[][] = [[instruction], headers, ...dataRows];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  worksheet['!cols'] = headers.map(() => ({ wch: 28 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');
  const outName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, outName);
}
