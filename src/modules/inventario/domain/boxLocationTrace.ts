export type BoxTraceOutcome =
  | 'TRANSFERRED'
  | 'OUTBOUND'
  | 'DISPATCHED'
  | 'ADMIN_DELETED'
  | 'SCRAP'
  | 'OUTSIDE_WAREHOUSE';

export type BoxTraceStatusCount = {
  status: string;
  label: string;
  count: number;
  /** Cajas donde están hoy esos equipos (una serie puede seguir en stock dentro de otra caja). */
  locations: string[];
};

export type ExternalBoxTrace = {
  boxId: string;
  boxCode: string;
  rack: string;
  locationLabel: string;
  outcome: BoxTraceOutcome;
  outcomeLabel: string;
  detail: string;
  movementType: string | null;
  destination: string | null;
  reference: string | null;
  movedAt: string | null;
  performedBy: string | null;
  currentUnits: number;
  statusCounts: BoxTraceStatusCount[];
};

const SERIES_STATUS_LABELS: Record<string, string> = {
  in_central_warehouse: 'Bodega Central',
  in_control_warehouse: 'Control de Bodega / L3',
  in_dispatch_warehouse: 'Bodega Despacho',
  in_workshop: 'Taller',
  in_qc: 'Control de Calidad',
  in_validation: 'Validación',
  ready_to_dispatch: 'Lista para despacho',
  dispatched: 'Despachada',
  irreparable: 'Scrap / Irreparable',
  scrapped: 'Scrap',
};

/** Estados que prueban que los equipos siguieron el flujo operativo en otra área. */
const TRANSFER_STATUSES = new Set([
  'in_workshop',
  'in_qc',
  'in_validation',
  'in_control_warehouse',
  'ready_to_dispatch',
]);

const SCRAP_STATUSES = new Set(['irreparable', 'scrapped']);

export function boxSeriesStatusLabel(status: string): string {
  return SERIES_STATUS_LABELS[status] ?? status.replaceAll('_', ' ');
}

/**
 * `ELIMINADO` es la marca interna con que el sistema saca una caja de Bodega
 * Central; no significa que la caja se haya dado de baja. Se muestra como
 * ubicación neutra para no confundir al operador.
 */
export function describeBoxLocation(
  rack: string | null,
  outcome?: BoxTraceOutcome,
  destination?: string | null,
): string {
  const normalized = rack?.trim().toUpperCase() ?? '';
  if (!normalized || normalized === 'ELIMINADO') {
    if (outcome === 'TRANSFERRED') {
      return `Fuera de Bodega por traslado${destination ? ` · ${destination}` : ''}`;
    }
    if (outcome === 'DISPATCHED') return 'Fuera de Bodega por despacho';
    if (outcome === 'SCRAP') return 'Fuera de Bodega · Scrap';
    if (outcome === 'ADMIN_DELETED') return 'Baja autorizada';
    return 'Fuera de Bodega Central';
  }
  return normalized;
}

export function classifyExternalBoxOutcome(input: {
  rack: string | null;
  movementType?: string | null;
  dispatchReference?: string | null;
  dominantUnitStatus?: string | null;
  destinationLabel?: string | null;
  hasApprovedDeletion?: boolean;
}): Pick<ExternalBoxTrace, 'outcome' | 'outcomeLabel'> {
  const rack = input.rack?.trim().toUpperCase() ?? '';
  const movement = input.movementType?.trim().toUpperCase() ?? '';
  const unitStatus = input.dominantUnitStatus ?? '';

  if (input.dispatchReference || movement === 'SALIDA' || unitStatus === 'dispatched') {
    return { outcome: 'DISPATCHED', outcomeLabel: 'Salida o despacho registrado' };
  }
  if (
    rack === 'OUTBOUND' ||
    rack === 'DESPACHO' ||
    rack === 'SALIDA' ||
    unitStatus === 'in_dispatch_warehouse'
  ) {
    return { outcome: 'OUTBOUND', outcomeLabel: 'Preparada para salida / Outbound' };
  }
  if (rack.startsWith('SCRAP') || rack === 'OBSOLETO' || SCRAP_STATUSES.has(unitStatus)) {
    return { outcome: 'SCRAP', outcomeLabel: 'Equipos enviados a Scrap' };
  }
  // El traslado de los equipos manda sobre la marca interna de la caja.
  if (
    TRANSFER_STATUSES.has(unitStatus) ||
    movement === 'TRASLADO' ||
    movement === 'DISPERSION_CAJA' ||
    rack.startsWith('TALLER')
  ) {
    return {
      outcome: 'TRANSFERRED',
      outcomeLabel: input.destinationLabel
        ? `Trasladada a ${input.destinationLabel}`
        : 'Trasladada a otra área',
    };
  }
  if (input.hasApprovedDeletion) {
    return { outcome: 'ADMIN_DELETED', outcomeLabel: 'Baja autorizada por gerencia' };
  }
  return { outcome: 'OUTSIDE_WAREHOUSE', outcomeLabel: 'Fuera de Bodega Central' };
}

export function describeBoxTraceDetail(input: {
  outcome: BoxTraceOutcome;
  currentUnits: number;
  dominantLabel?: string | null;
  dominantCount?: number | null;
  destination?: string | null;
}): string {
  const { currentUnits, dominantLabel, dominantCount, destination } = input;
  const area = dominantLabel || destination || 'otra área';
  // Los equipos de una caja pueden terminar repartidos; no se puede afirmar
  // que todos siguieron el mismo camino que el grupo mayoritario.
  const allTogether = dominantCount == null || dominantCount >= currentUnits;
  const units = allTogether
    ? `sus ${currentUnits} equipos`
    : `${dominantCount} de sus ${currentUnits} equipos`;
  const rest = allTogether ? '' : ' El resto está en otras ubicaciones; vea el desglose.';

  switch (input.outcome) {
    case 'TRANSFERRED':
      return `La caja salió de Bodega Central porque ${units} fueron trasladados a ${area}. La caja no se dio de baja.${rest}`;
    case 'DISPATCHED':
      return `La caja salió de Bodega Central por despacho de ${units}.${rest}`;
    case 'OUTBOUND':
      return `La caja está en preparación de salida con ${currentUnits} equipos; ya no forma parte del stock de Bodega Central.`;
    case 'SCRAP':
      return `${allTogether ? `Los ${currentUnits} equipos de la caja` : `${dominantCount} de sus ${currentUnits} equipos`} se enviaron a Scrap, por lo que salió de Bodega Central.${rest}`;
    case 'ADMIN_DELETED':
      return currentUnits > 0
        ? `La caja se dio de baja con autorización gerencial. Se localizaron ${currentUnits} equipos en otras ubicaciones.`
        : 'La caja se dio de baja con autorización gerencial y no conserva equipos.';
    default:
      return `La caja no pertenece actualmente a Bodega Central${destination ? `; último destino: ${destination}` : ''}.`;
  }
}
