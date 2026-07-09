import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { normalizeSerial } from '@/lib/sap/normalizeSerial';

export const SAP_REQUIRED_COLUMNS = [
  'Material',
  'Texto breve de material',
  'Número de serie',
  'Centro',
  'Almacén',
  'Lote',
  'Status del sistema',
  'Lote de stock',
] as const;

export type SapUploadRow = Record<string, string>;

const HEADER_ALIASES: Record<string, (typeof SAP_REQUIRED_COLUMNS)[number]> = {
  almacén: 'Almacén',
  almacé: 'Almacén',
  almacen: 'Almacén',
  'número de serie': 'Número de serie',
  'numero de serie': 'Número de serie',
  material: 'Material',
  'texto breve de material': 'Texto breve de material',
  centro: 'Centro',
  lote: 'Lote',
  'status del sistema': 'Status del sistema',
  'lote de stock': 'Lote de stock',
};

export function normalizeSapHeader(header: string): string {
  const trimmed = header.replace(/\uFEFF/g, '').trim();
  if (!trimmed) return trimmed;
  const alias = HEADER_ALIASES[trimmed.toLowerCase()];
  if (alias) return alias;
  const exact = SAP_REQUIRED_COLUMNS.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  return exact || trimmed;
}

function normalizeSapRow(raw: Record<string, unknown>): SapUploadRow {
  const out: SapUploadRow = {};
  for (const [key, val] of Object.entries(raw)) {
    const nk = normalizeSapHeader(key);
    if (!nk || val === null || val === undefined || val === '') continue;
    if (nk === 'Número de serie') {
      const serial = normalizeSerial(val);
      if (!serial) continue;
      out[nk] = serial;
    } else {
      out[nk] = String(val).trim();
    }
  }
  return out;
}

export function validateSapHeaders(headers: string[]): string[] {
  const normalized = new Set(headers.map(normalizeSapHeader));
  return SAP_REQUIRED_COLUMNS.filter((c) => !normalized.has(c));
}

function filterDataRows(rows: SapUploadRow[]): SapUploadRow[] {
  return rows.filter((row) => Boolean(row['Número de serie']?.trim()));
}

async function sha256Hex(data: ArrayBuffer | string): Promise<string> {
  const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function parseCsvText(text: string): SapUploadRow[] {
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message || 'Error al leer CSV');
  }
  return filterDataRows((parsed.data || []).map(normalizeSapRow));
}

function parseXlsxBuffer(buffer: ArrayBuffer): { rows: SapUploadRow[]; headers: string[] } {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, cellText: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('El archivo Excel no contiene hojas.');
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, defval: '' });
  const headerRow = (matrix[0] || []).map((cell) => normalizeSapHeader(String(cell)));
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  if (rawRows.length === 0 && headerRow.every((h) => !h)) {
    throw new Error('El archivo Excel está vacío.');
  }
  return {
    headers: headerRow.filter(Boolean),
    rows: filterDataRows(rawRows.map(normalizeSapRow)),
  };
}

export function isExcelSapFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return name.endsWith('.xlsx') || name.endsWith('.xls');
}

export type ParsedSapUpload = {
  rows: SapUploadRow[];
  hash: string;
  format: 'csv' | 'xlsx';
};

/** Lee CSV o Excel SAP exportado y valida columnas obligatorias. */
export async function parseSapUploadFile(file: File): Promise<ParsedSapUpload> {
  const isExcel = isExcelSapFile(file);

  if (isExcel) {
    const buffer = await file.arrayBuffer();
    const hash = await sha256Hex(buffer);
    const { rows, headers } = parseXlsxBuffer(buffer);
    const missing = validateSapHeaders(headers);
    if (missing.length > 0) {
      throw new Error(`Estructura inválida. Faltan las columnas: ${missing.join(', ')}`);
    }
    if (rows.length === 0) {
      throw new Error('No hay filas con Número de serie en el archivo Excel.');
    }
    return { rows, hash, format: 'xlsx' };
  }

  const text = await file.text();
  const hash = await sha256Hex(text);
  const rows = parseCsvText(text);
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  const headers = (parsed.meta.fields || []).map(normalizeSapHeader);
  const missing = validateSapHeaders(headers);
  if (missing.length > 0) {
    throw new Error(`Estructura inválida. Faltan las columnas: ${missing.join(', ')}`);
  }
  return { rows, hash, format: 'csv' };
}
