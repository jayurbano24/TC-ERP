import { downloadCatalogExcel } from './catalogExcel';
import { findCatalogIdByName } from './workshopCatalogCsv';

export function formatDigitsPerSeries(digits: number[] | undefined): string {
  return (digits && digits.length > 0 ? digits : [12]).join('/');
}

export function parseDigitsPerSeries(raw: string, seriesCount: number): number[] {
  const parsed = raw
    .split(/[/|,]/)
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const base = parsed.length > 0 ? parsed : [12];
  const out = [...base];
  while (out.length < seriesCount) out.push(out[out.length - 1] ?? 12);
  return out.slice(0, seriesCount);
}

export function exportBrandsCsv(items: Array<{ nombre: string }>): void {
  void downloadCatalogExcel(
    `catalogo_marcas_${Date.now()}.xlsx`,
    'Marcas — nombre único. Filas existentes se actualizan por nombre.',
    ['nombre'],
    items.map((b) => [b.nombre]),
  );
}

export function exportTechnologiesCsv(
  items: Array<{ nombre: string; seriesCount: number; digitsPerSeries?: number[] }>,
): void {
  void downloadCatalogExcel(
    `catalogo_tecnologias_${Date.now()}.xlsx`,
    'Tecnologías — digitos: longitudes por serie separadas por / (ej. 12/12).',
    ['nombre', 'cant_series', 'digitos'],
    items.map((t) => [t.nombre, String(t.seriesCount), formatDigitsPerSeries(t.digitsPerSeries)]),
  );
}

export function exportCarriersCsv(items: Array<{ id: string; nombre: string }>): void {
  void downloadCatalogExcel(
    `catalogo_transportes_${Date.now()}.xlsx`,
    'Transportes — codigo es identificador de negocio (no UUID).',
    ['codigo', 'nombre'],
    items.map((c) => [c.id, c.nombre]),
  );
}

export function exportPxProvidersCsv(items: Array<{ nombre: string }>): void {
  void downloadCatalogExcel(
    `catalogo_proveedores_px_${Date.now()}.xlsx`,
    'Proveedores PX — nombre único. Filas existentes se actualizan por nombre.',
    ['nombre'],
    items.map((p) => [p.nombre]),
  );
}

export function exportReturnReasonsCsv(items: Array<{ nombre: string }>): void {
  void downloadCatalogExcel(
    `catalogo_razones_devolucion_${Date.now()}.xlsx`,
    'Razones de devolución — nombre único. Filas existentes se actualizan por nombre.',
    ['nombre'],
    items.map((r) => [r.nombre]),
  );
}

export function exportAgenciesCsv(
  items: Array<{
    id: string;
    nombre: string;
    encargado: string;
    email: string;
    telefono: string;
    direccion: string;
  }>,
): void {
  void downloadCatalogExcel(
    `directorio_agencias_${Date.now()}.xlsx`,
    'Agencias CAC — codigo es identificador de negocio (no UUID).',
    ['codigo', 'nombre', 'encargado', 'email', 'telefono', 'direccion'],
    items.map((a) => [a.id, a.nombre, a.encargado, a.email, a.telefono, a.direccion]),
  );
}

export function findCarrierDbIdByCode(
  code: string,
  items: Array<{ id: string; dbId?: string }>,
): string | undefined {
  const key = code.trim().toUpperCase();
  if (!key) return undefined;
  return items.find((c) => c.id.trim().toUpperCase() === key)?.dbId;
}

export { findCatalogIdByName };
