/**
 * Validación pura del motivo de devolución contra catálogo operativo.
 */
export function validateReturnMotivoAgainstCatalog(
  motivo: string,
  catalogNames: string[] | null | undefined,
): boolean {
  const trimmed = motivo.trim();
  if (!trimmed) return false;
  const options = catalogNames ?? [];
  if (options.length === 0) return trimmed.length >= 3;
  return options.some((name) => name.trim().toLowerCase() === trimmed.toLowerCase());
}
