/**
 * Clasificación Backoffice desde CARGA:
 * - Equipo / Devolución: todos los roles con acceso a Backoffice
 * - Accesorio / Teléfono: solo SUPERVISOR STB
 * GERENTE GENERAL (isAdmin) conserva acceso total de soporte.
 */

export function normalizeRoleLabel(role: string | null | undefined): string {
  return (role ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

export const SUB_BODEGA_CLASSIFY_ROLE = 'SUPERVISOR STB';

/** @deprecated Prefer SUB_BODEGA_CLASSIFY_ROLE */
export const ACCESORIOS_CLASSIFY_ROLE = SUB_BODEGA_CLASSIFY_ROLE;

function canClassifySubBodega(opts: {
  roleLabel?: string | null;
  isAdmin?: boolean;
}): boolean {
  if (opts.isAdmin) return true;
  return normalizeRoleLabel(opts.roleLabel) === SUB_BODEGA_CLASSIFY_ROLE;
}

export function canClassifyToAccesorios(opts: {
  roleLabel?: string | null;
  isAdmin?: boolean;
}): boolean {
  return canClassifySubBodega(opts);
}

export function canClassifyToTelefonos(opts: {
  roleLabel?: string | null;
  isAdmin?: boolean;
}): boolean {
  return canClassifySubBodega(opts);
}
