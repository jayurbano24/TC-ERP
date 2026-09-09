import { normalizeCatalogName } from '@/shared/catalogs/catalogNameDedup';
import { downloadCatalogExcel } from './catalogExcel';

export const WORKSHOP_CATALOG_PAGE_SIZE = 20;
export const MODELS_CATALOG_PAGE_SIZE = 16;

export function escapeCsvCell(value: string): string {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function downloadCsv(filename: string, lines: string[]): void {
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Parsea CSV simple (soporta comillas). Omite líneas vacías y comentarios #. */
export function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const pushRow = () => {
    if (row.some((c) => c.length > 0)) rows.push(row);
    row = [];
  };

  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushCell();
    } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
      pushCell();
      pushRow();
      if (ch === '\r') i += 1;
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  pushCell();
  pushRow();
  return rows.filter((r) => !r[0]?.startsWith('#'));
}

export function csvRowsToObjects(rows: string[][]): Record<string, string>[] {
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row.length) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = row[idx]?.trim() ?? '';
    });
    if (Object.values(obj).some(Boolean)) out.push(obj);
  }
  return out;
}

export async function readCsvFile(file: File): Promise<Record<string, string>[]> {
  const text = await file.text();
  return csvRowsToObjects(parseCsvText(text));
}

export function exportRepairsCsv(items: Array<{ nombre: string }>): void {
  void downloadCatalogExcel(
    `catalogo_reparaciones_${Date.now()}.xlsx`,
    'Reparaciones — nombre único. Filas existentes se actualizan por nombre.',
    ['nombre'],
    items.map((r) => [r.nombre]),
  );
}

export function exportDiagnosticsCsv(
  items: Array<{ nombre: string; reparacionesIds: string[] }>,
  repairs: Array<{ id: string; nombre: string }>,
): void {
  const repairNameById = new Map(repairs.map((r) => [r.id, r.nombre]));
  void downloadCatalogExcel(
    `catalogo_diagnosticos_${Date.now()}.xlsx`,
    'Diagnósticos — reparaciones_sugeridas: nombres separados por |.',
    ['nombre', 'reparaciones_sugeridas'],
    items.map((d) => {
      const reps = (d.reparacionesIds || [])
        .map((id) => repairNameById.get(id) || '')
        .filter(Boolean)
        .join('|');
      return [d.nombre, reps];
    }),
  );
}

export function exportReacondicionadoCsv(
  items: Array<{ nombre: string; technologyIds?: string[]; modelIds?: string[] }>,
  tecnologias: Array<{ id: string; nombre: string }>,
  modelos: Array<{ id: string; nombre: string }>,
): void {
  const techById = new Map(tecnologias.map((t) => [t.id, t.nombre]));
  const modelById = new Map(modelos.map((m) => [m.id, m.nombre]));
  void downloadCatalogExcel(
    `catalogo_reacondicionado_${Date.now()}.xlsx`,
    'Reacondicionado — tecnologias/modelos: * = todas, o nombres separados por |.',
    ['nombre', 'tecnologias', 'modelos'],
    items.map((t) => {
      const techs =
        !t.technologyIds?.length
          ? '*'
          : t.technologyIds.map((id) => techById.get(id) || '').filter(Boolean).join('|');
      const mods =
        !t.modelIds?.length
          ? '*'
          : t.modelIds.map((id) => modelById.get(id) || '').filter(Boolean).join('|');
      return [t.nombre, techs, mods];
    }),
  );
}

export function findCatalogIdByName(
  nombre: string,
  items: Array<{ id: string; nombre: string }>,
): string | undefined {
  const key = normalizeCatalogName(nombre);
  if (!key) return undefined;
  return items.find((i) => normalizeCatalogName(i.nombre) === key)?.id;
}

export function resolveRepairIdsFromNames(
  raw: string,
  repairs: Array<{ id: string; nombre: string }>,
): string[] {
  if (!raw.trim()) return [];
  const byName = new Map<string, string>();
  for (const r of repairs) {
    const key = normalizeCatalogName(r.nombre);
    if (key && !byName.has(key)) byName.set(key, r.id);
  }
  const separator = raw.includes('|') ? '|' : ',';
  const ids: string[] = [];
  for (const part of raw.split(separator)) {
    const token = part.trim();
    if (!token) continue;
    const id = byName.get(normalizeCatalogName(token));
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

export function resolveCatalogIdsFromNames(
  raw: string,
  catalog: Array<{ id: string; nombre: string }>,
): string[] {
  if (!raw.trim() || raw.trim() === '*') return [];
  const byName = new Map<string, string>();
  for (const item of catalog) {
    const key = normalizeCatalogName(item.nombre);
    if (key && !byName.has(key)) byName.set(key, item.id);
  }
  const ids: string[] = [];
  for (const part of raw.split('|')) {
    const token = part.trim();
    if (!token || token === '*') continue;
    const id = byName.get(normalizeCatalogName(token));
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}
