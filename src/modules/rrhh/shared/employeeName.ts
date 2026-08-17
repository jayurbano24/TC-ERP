/** Normaliza nombre de empleado para detectar duplicados (sin acentos, espacios colapsados). */
export function normalizeEmployeeName(name: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export type EmployeeNameRow = {
  id?: string | null;
  nombre_completo?: string | null;
};

/** Busca otro empleado con el mismo nombre normalizado (excluye `excludeId` al editar). */
export function findEmployeeDuplicateByName(
  candidates: EmployeeNameRow[],
  name: string,
  excludeId?: string | null
): EmployeeNameRow | null {
  const key = normalizeEmployeeName(name);
  if (!key) return null;
  return (
    candidates.find((e) => {
      if (excludeId && e.id && String(e.id) === String(excludeId)) return false;
      return normalizeEmployeeName(String(e.nombre_completo || '')) === key;
    }) ?? null
  );
}
