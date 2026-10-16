import type { ReportRow } from '../../domain/types/report.types';

/** Clave estable: una fila por OS (S1–S4 van en columnas, no en filas repetidas). */
export function prediagnosticoExportRowKey(row: ReportRow): string {
  const os = String(row['Número de ingreso al SCA'] ?? '')
    .trim()
    .toUpperCase();
  if (os) return os;
  const serie = String(row['Serie'] ?? '')
    .trim()
    .toUpperCase();
  if (serie) return `\0${serie}`;
  return `\0${JSON.stringify(row).slice(0, 120)}`;
}

/**
 * Elimina filas repetidas (misma OS + misma serie).
 * Conserva la primera aparición (p. ej. la más reciente si el caller ya ordenó así).
 */
export function dedupePrediagnosticoContractRows(rows: ReportRow[]): ReportRow[] {
  const seen = new Set<string>();
  const out: ReportRow[] = [];
  for (const row of rows) {
    const key = prediagnosticoExportRowKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

type SeriesLike = {
  id: string;
  serial_number?: string | null;
  created_at?: string | null;
};

/**
 * Varias filas en `series` por la misma OS/serie inflaban el Excel (×2, ×3…).
 * Una fila exportable por número de serie; sin serie, una por id de serie.
 */
export function dedupeSeriesRowsForPrediagnosticoExport<T extends SeriesLike>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const serial = String(row.serial_number ?? '').trim().toUpperCase();
    const key = serial || `id:${String(row.id)}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, row);
      continue;
    }
    const prevTs = prev.created_at ? Date.parse(prev.created_at) : 0;
    const curTs = row.created_at ? Date.parse(row.created_at) : 0;
    if (curTs >= prevTs) byKey.set(key, row);
  }
  return [...byKey.values()];
}
