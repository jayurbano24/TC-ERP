/** Normaliza nombre de catálogo para comparación (sin acentos, mayúsculas, espacios). */
export function normalizeCatalogName(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/** Nombre canónico para persistir en BD (misma regla que deduplicación). */
export function canonicalCatalogName(raw: string): string {
  const collapsed = String(raw || '')
    .normalize('NFKC')
    .replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalizeCatalogName(collapsed);
}

export type CatalogNamedItem = { id: string; nombre: string };

export type ModelNamedItem = { id: string; nombre: string; marcaId: string };

export function modelCatalogKey(marcaId: string, nombre: string): string {
  return `${marcaId}::${normalizeCatalogName(nombre)}`;
}

export function findDuplicateModelName(
  models: ModelNamedItem[],
  nombre: string,
  marcaId: string,
  excludeId?: string,
): ModelNamedItem | null {
  const nameKey = normalizeCatalogName(nombre);
  if (!nameKey || !marcaId) return null;
  return (
    models.find(
      (m) =>
        m.marcaId === marcaId &&
        normalizeCatalogName(m.nombre) === nameKey &&
        m.id !== excludeId,
    ) ?? null
  );
}

/** Marca filas duplicadas por marca + nombre (2.ª aparición en adelante). */
export function annotateModelDuplicates<T extends ModelNamedItem>(
  items: T[],
): Array<T & { esDuplicado: boolean }> {
  const sorted = [...items].sort((a, b) => {
    const brandCmp = a.marcaId.localeCompare(b.marcaId);
    if (brandCmp !== 0) return brandCmp;
    return normalizeCatalogName(a.nombre).localeCompare(normalizeCatalogName(b.nombre), 'es');
  });
  const seen = new Set<string>();
  return sorted.map((item) => {
    const key = modelCatalogKey(item.marcaId, item.nombre);
    const esDuplicado = seen.has(key);
    seen.add(key);
    return { ...item, esDuplicado };
  });
}

export function countModelDuplicates<T extends ModelNamedItem>(items: T[]): number {
  const seen = new Set<string>();
  let dupes = 0;
  for (const item of items) {
    const key = modelCatalogKey(item.marcaId, item.nombre);
    if (seen.has(key)) dupes += 1;
    else seen.add(key);
  }
  return dupes;
}

/** Marca filas duplicadas (2.ª aparición en adelante) para resaltar en UI. */
export function annotateCatalogDuplicates<T extends CatalogNamedItem>(
  items: T[],
): Array<T & { esDuplicado: boolean }> {
  const sorted = [...items].sort((a, b) =>
    normalizeCatalogName(a.nombre).localeCompare(normalizeCatalogName(b.nombre), 'es'),
  );
  const seen = new Set<string>();
  return sorted.map((item) => {
    const key = normalizeCatalogName(item.nombre);
    const esDuplicado = key ? seen.has(key) : false;
    if (key) seen.add(key);
    return { ...item, esDuplicado };
  });
}

/** Conserva el primer ítem por nombre normalizado; orden alfabético. */
export function dedupeCatalogByName<T extends CatalogNamedItem>(items: T[]): T[] {
  const byName = new Map<string, T>();
  for (const item of items) {
    const key = normalizeCatalogName(item.nombre);
    if (!key || byName.has(key)) continue;
    byName.set(key, item);
  }
  return [...byName.values()].sort((a, b) =>
    normalizeCatalogName(a.nombre).localeCompare(normalizeCatalogName(b.nombre), 'es'),
  );
}

export function countCatalogDuplicates<T extends CatalogNamedItem>(items: T[]): number {
  const seen = new Set<string>();
  let dupes = 0;
  for (const item of items) {
    const key = normalizeCatalogName(item.nombre);
    if (!key) continue;
    if (seen.has(key)) dupes += 1;
    else seen.add(key);
  }
  return dupes;
}

export function findDuplicateCatalogName<T extends CatalogNamedItem>(
  items: T[],
  nombre: string,
  excludeId?: string,
): T | null {
  const key = normalizeCatalogName(nombre);
  if (!key) return null;
  return (
    items.find(
      (item) => normalizeCatalogName(item.nombre) === key && item.id !== excludeId,
    ) ?? null
  );
}

/** Mapa id → nombre incluyendo alias duplicados (mismo nombre normalizado). */
export function buildCatalogNameLookup<T extends CatalogNamedItem>(
  items: T[],
): Map<string, string> {
  const canonicalByName = new Map<string, string>();
  for (const item of items) {
    const key = normalizeCatalogName(item.nombre);
    if (!key) continue;
    if (!canonicalByName.has(key)) {
      canonicalByName.set(key, item.nombre);
    }
  }

  const lookup = new Map<string, string>();
  for (const item of items) {
    const key = normalizeCatalogName(item.nombre);
    lookup.set(item.id, canonicalByName.get(key) || item.nombre);
  }
  return lookup;
}
