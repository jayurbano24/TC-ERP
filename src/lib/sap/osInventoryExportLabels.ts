/**
 * Estatus operativo del export En planta — mismas etiquetas que
 * Inventario OS · Capacidad instalada (OsCapacityInstalledPanel).
 */

export type SeriesForInventory = {
  id?: string;
  current_status: string | null;
  current_box_id: string | null;
};

export type BoxMeta = {
  box_code: string | null;
  rack_location: string | null;
};

/** Etiquetas visibles en panel / pivot del usuario. */
export const OS_INVENTORY_EXPORT_STATUS = {
  PENDIENTE_BODEGA: 'Pendiente Bodega',
  BODEGA_CENTRAL: 'Bodega Central',
  DIAGNOSTICO: 'Diagnóstico',
  REPARACION: 'Reparación',
  REACONDICIONADO: 'Reacondicionado',
  CONTROL_CALIDAD: 'Control de Calidad',
  L3: 'L3',
  SCRAPS_PISO: 'SCRAPS piso',
  BODEGA_SCRAPS: 'Bodega SCRAPS',
  EQUIPO_LISTO: 'Equipo Listo',
  BODEGA_DESPACHO: 'Bodega Despacho',
  PISTOLEO: 'Pistoleo en curso',
  SIN_SERIES: 'Sin series',
  OTRO: 'Otro en planta',
} as const;

export type OsInventoryExportStatus =
  (typeof OS_INVENTORY_EXPORT_STATUS)[keyof typeof OS_INVENTORY_EXPORT_STATUS];

function isTmpBox(box: BoxMeta | undefined): boolean {
  if (!box) return false;
  const rack = String(box.rack_location || '').toUpperCase();
  const code = String(box.box_code || '').toUpperCase();
  return rack === 'EN_PROCESO' || code.startsWith('TMP-');
}

function isScrapBox(box: BoxMeta | undefined): boolean {
  if (!box) return false;
  const rack = String(box.rack_location || '').trim().toUpperCase();
  const code = String(box.box_code || '').trim().toUpperCase();
  return (
    rack === 'SCRAP' ||
    rack === 'SCRAPS' ||
    rack.startsWith('SCRAP') ||
    code.startsWith('BOX-BAD')
  );
}

export type SeriesInventoryContext = {
  /** OS en cola pendiente ingreso (CAC ∪ RECEPCIONADO). */
  pendienteIngreso: boolean;
  /** Alguna serie de la OS en in_dispatch_warehouse. */
  osHasDispatch: boolean;
  /** Serie in_central con auditoría post-taller → Equipo Listo. */
  auditedCentralSeriesIds: Set<string>;
  boxById: Map<string, BoxMeta>;
  /** Alguna serie de la OS en caja SCRAP / BOX-BAD. */
  osHasScrapBox: boolean;
};

/**
 * Estatus operativo por **serie** (ledger), alineado a tiles del panel.
 * Prioridad OS pendiente / despacho / listo antes que estados TC de la serie.
 */
export function resolveSeriesInventoryExportStatus(
  series: SeriesForInventory,
  ctx: SeriesInventoryContext,
): OsInventoryExportStatus {
  if (ctx.pendienteIngreso) {
    return OS_INVENTORY_EXPORT_STATUS.PENDIENTE_BODEGA;
  }

  const st = String(series.current_status || '');
  const box = series.current_box_id
    ? ctx.boxById.get(String(series.current_box_id))
    : undefined;

  if (series.current_box_id && isTmpBox(box)) {
    return OS_INVENTORY_EXPORT_STATUS.PISTOLEO;
  }

  if (st === 'in_dispatch_warehouse') {
    return OS_INVENTORY_EXPORT_STATUS.BODEGA_DESPACHO;
  }

  if (
    st === 'in_central_warehouse' &&
    series.id &&
    ctx.auditedCentralSeriesIds.has(String(series.id))
  ) {
    return OS_INVENTORY_EXPORT_STATUS.EQUIPO_LISTO;
  }

  if (series.current_box_id && isScrapBox(box)) {
    return OS_INVENTORY_EXPORT_STATUS.BODEGA_SCRAPS;
  }

  if (st === 'irreparable' && !series.current_box_id && !ctx.osHasScrapBox) {
    return OS_INVENTORY_EXPORT_STATUS.SCRAPS_PISO;
  }

  if (st === 'in_validation') {
    return OS_INVENTORY_EXPORT_STATUS.CONTROL_CALIDAD;
  }
  if (st === 'in_qc') {
    return OS_INVENTORY_EXPORT_STATUS.REPARACION;
  }
  if (st === 'in_workshop') {
    return OS_INVENTORY_EXPORT_STATUS.DIAGNOSTICO;
  }
  if (st === 'in_control_warehouse') {
    return OS_INVENTORY_EXPORT_STATUS.L3;
  }

  if (st === 'ready_to_dispatch' && !series.current_box_id) {
    return OS_INVENTORY_EXPORT_STATUS.REACONDICIONADO;
  }

  const stockCentral =
    (st === 'in_central_warehouse' || st === 'ready_to_dispatch') &&
    series.current_box_id &&
    !isTmpBox(box) &&
    !ctx.osHasDispatch &&
    !(series.id && ctx.auditedCentralSeriesIds.has(String(series.id)));

  if (stockCentral) {
    return OS_INVENTORY_EXPORT_STATUS.BODEGA_CENTRAL;
  }

  if (st === 'RECEPCIONADO_BODEGA_GENERAL') {
    return OS_INVENTORY_EXPORT_STATUS.PENDIENTE_BODEGA;
  }

  return OS_INVENTORY_EXPORT_STATUS.OTRO;
}

function hasStatus(series: SeriesForInventory[], st: string): boolean {
  return series.some((s) => String(s.current_status || '') === st);
}

/**
 * Un **Estatus operativo** por OS (sin duplicar filas en export).
 * Prioridad = flujo Capacidad instalada; taller = etapa más avanzada en la OS.
 */
export function resolveOsInventoryExportStatus(
  series: SeriesForInventory[],
  ctx: SeriesInventoryContext,
): OsInventoryExportStatus {
  if (ctx.pendienteIngreso) {
    return OS_INVENTORY_EXPORT_STATUS.PENDIENTE_BODEGA;
  }

  if (series.length === 0) {
    return OS_INVENTORY_EXPORT_STATUS.SIN_SERIES;
  }

  if (series.some((s) => s.current_box_id && isTmpBox(ctx.boxById.get(String(s.current_box_id))))) {
    return OS_INVENTORY_EXPORT_STATUS.PISTOLEO;
  }

  if (ctx.osHasDispatch || hasStatus(series, 'in_dispatch_warehouse')) {
    return OS_INVENTORY_EXPORT_STATUS.BODEGA_DESPACHO;
  }

  if (
    series.some(
      (s) =>
        s.current_status === 'in_central_warehouse' &&
        s.id &&
        ctx.auditedCentralSeriesIds.has(String(s.id)),
    )
  ) {
    return OS_INVENTORY_EXPORT_STATUS.EQUIPO_LISTO;
  }

  if (
    series.some(
      (s) =>
        s.current_box_id && isScrapBox(ctx.boxById.get(String(s.current_box_id))),
    )
  ) {
    return OS_INVENTORY_EXPORT_STATUS.BODEGA_SCRAPS;
  }

  if (hasStatus(series, 'in_validation')) {
    return OS_INVENTORY_EXPORT_STATUS.CONTROL_CALIDAD;
  }
  if (hasStatus(series, 'in_qc')) {
    return OS_INVENTORY_EXPORT_STATUS.REPARACION;
  }
  if (hasStatus(series, 'in_workshop')) {
    return OS_INVENTORY_EXPORT_STATUS.DIAGNOSTICO;
  }
  if (hasStatus(series, 'in_control_warehouse')) {
    return OS_INVENTORY_EXPORT_STATUS.L3;
  }

  if (
    series.some((s) => s.current_status === 'irreparable' && !s.current_box_id) &&
    !ctx.osHasScrapBox
  ) {
    return OS_INVENTORY_EXPORT_STATUS.SCRAPS_PISO;
  }

  if (series.some((s) => s.current_status === 'ready_to_dispatch' && !s.current_box_id)) {
    return OS_INVENTORY_EXPORT_STATUS.REACONDICIONADO;
  }

  const stockCentral = series.some((s) => {
    const st = String(s.current_status || '');
    if (!['in_central_warehouse', 'ready_to_dispatch'].includes(st)) return false;
    if (!s.current_box_id) return false;
    if (isTmpBox(ctx.boxById.get(String(s.current_box_id)))) return false;
    if (ctx.osHasDispatch) return false;
    if (s.id && ctx.auditedCentralSeriesIds.has(String(s.id))) return false;
    return true;
  });
  if (stockCentral) {
    return OS_INVENTORY_EXPORT_STATUS.BODEGA_CENTRAL;
  }

  if (hasStatus(series, 'RECEPCIONADO_BODEGA_GENERAL')) {
    return OS_INVENTORY_EXPORT_STATUS.PENDIENTE_BODEGA;
  }

  return OS_INVENTORY_EXPORT_STATUS.OTRO;
}

/** Filtros bandeja CAC alineados a count_os_inventory_modules → pendiente_bodega. */
export const CAC_PENDIENTE_EXCLUDED_STATUSES = [
  'returned',
  'DEVUELTO_BLOQUE',
  'DEVUELTO',
  'ingresado_bodega',
  'INGRESADO_BODEGA',
  'in_central_warehouse',
  'IN_CENTRAL_WAREHOUSE',
] as const;

export const EQUIPO_LISTO_AUDIT_ACTIONS = [
  'INGRESO A TALLER',
  'DIAGNÓSTICO INICIAL COMPLETADO',
  'REPARACIÓN COMPLETADA',
  'REPARACIÓN L3 COMPLETADA',
  'CONTROL DE CALIDAD COMPLETADO',
  'REACONDICIONADO COMPLETADO',
  'TRASLADO MASIVO A TALLER',
] as const;

export function isCacTrayRowPendiente(row: {
  unit_status: string | null;
  unit_status_label: string | null;
}): boolean {
  const st = String(row.unit_status ?? '');
  if (CAC_PENDIENTE_EXCLUDED_STATUSES.some((x) => st === x)) return false;
  const label = String(row.unit_status_label ?? '').toLowerCase();
  if (label.includes('devuelt') || label.includes('devolver') || label.includes('retorno')) {
    return false;
  }
  if (label.includes('bodega general')) return false;
  return true;
}
