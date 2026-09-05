export type WarehouseBoxOperationalStatus =
  | 'Full'
  | 'En proceso'
  | 'Cerrada parcial'
  | 'Cerrada con diferencia'
  | 'Vacía';

export type WarehouseBoxStatusInput = {
  units: number;
  capacity: number;
  boxStatus?: string | null;
  isPartialBox?: boolean | null;
  partialReason?: string | null;
};

export type WarehouseBoxStatusResult = {
  status: WarehouseBoxOperationalStatus;
  difference: number;
  reason: string;
};

const CLOSED_STATUSES = new Set(['closed', 'cerrada']);

/**
 * Estado operativo común para pantalla y exportación.
 * No confunde una caja cerrada con una captura todavía en proceso.
 */
export function resolveWarehouseBoxOperationalStatus(
  input: WarehouseBoxStatusInput,
): WarehouseBoxStatusResult {
  const units = Math.max(0, Number(input.units) || 0);
  const capacity = Math.max(0, Number(input.capacity) || 0);
  const difference = Math.max(capacity - units, 0);
  const boxStatus = input.boxStatus?.trim().toLowerCase() ?? '';

  if (units === 0) {
    return {
      status: 'Vacía',
      difference,
      reason: CLOSED_STATUSES.has(boxStatus)
        ? 'Caja cerrada sin unidades actualmente asociadas'
        : 'Caja sin unidades capturadas',
    };
  }
  if (capacity === 0 || difference === 0) {
    return { status: 'Full', difference: 0, reason: 'Capacidad alcanzada' };
  }
  if (input.isPartialBox) {
    return {
      status: 'Cerrada parcial',
      difference,
      reason: input.partialReason?.trim() || 'Cerrada con menos unidades que las declaradas',
    };
  }
  if (CLOSED_STATUSES.has(boxStatus)) {
    return {
      status: 'Cerrada con diferencia',
      difference,
      reason: 'La cantidad actual es menor que la capacidad registrada; valide traslados o salidas',
    };
  }
  return {
    status: 'En proceso',
    difference,
    reason: 'Captura pendiente de completar',
  };
}
