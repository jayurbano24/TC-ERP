/** TTL en memoria para catálogos de referencia (marcas/modelos/tecnologías). */
export const REFERENCE_CATALOG_TTL_MS = 30 * 60 * 1000;

type CatalogKey = 'technologies' | 'brands' | 'models';

const store: Partial<Record<CatalogKey, { at: number; rows: unknown[] }>> = {};

export function getCachedReferenceCatalog<T>(key: CatalogKey): T[] | null {
  const entry = store[key];
  if (!entry) return null;
  if (Date.now() - entry.at > REFERENCE_CATALOG_TTL_MS) {
    delete store[key];
    return null;
  }
  return entry.rows as T[];
}

export function setCachedReferenceCatalog(key: CatalogKey, rows: unknown[]): void {
  store[key] = { at: Date.now(), rows };
}

export function invalidateReferenceCatalogCache(): void {
  for (const key of Object.keys(store) as CatalogKey[]) {
    delete store[key];
  }
}
