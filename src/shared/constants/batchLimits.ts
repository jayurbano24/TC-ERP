/** Límites anti-saturación compartidos entre API y cliente (Fase 1). */
export const BATCH_LIMITS = {
  /** Dispersión Bodega → Diagnóstico (1 RPC pesado por caja). */
  WORKSHOP_TRANSFER_BOXES: 10,
  /** Equipos (filas) seleccionables en operación masiva Taller — 1 equipo = 1 OS. */
  WORKSHOP_OPERATE_MAX_EQUIPMENTS: 25,
  /** Series (registros en BD) máximas por operación masiva Taller. */
  WORKSHOP_OPERATE_MAX_SERIES: 120,
  /** Equipos procesados por llamada POST /api/v1/workshop/operate-batch. */
  WORKSHOP_OPERATE_SERIES_BATCH: 40,
  /** Equipos por página al listar cola Taller (1 equipo = 1 OS en cola). */
  WORKSHOP_QUEUE_PAGE_OS: 50,
  /** IDs en cláusula PostgREST in.() */
  UUID_IN_CLAUSE: 80,
  /** Equipos por operación PX (finalize lote RPC — no limita captura scan a scan). */
  PX_EQUIPMENT_PER_OP: 150,
  /** Equipos promovidos por llamada a finalize_px_reception_batch_tx. */
  PX_FINALIZE_PROMOTE_BATCH: 10,
  /** Tope de iteraciones prep (1 caja por RPC). */
  PX_FINALIZE_PREP_MAX_ITERATIONS: 200,
  /** Tope de iteraciones promote (equipos por lote). */
  PX_FINALIZE_PROMOTE_MAX_ITERATIONS: 500,
  /** Cajas por recepción PX — default operativo (pedidos 40–50 cajas). */
  PX_BOXES_DEFAULT: 50,
  /** Tope duro de cajas por recepción PX (cabecera + servidor). */
  PX_BOXES_MAX: 100,
  /** Equipos (series) declarados por caja — típico 40–80, pico ~120. */
  PX_UNITS_PER_BOX_MAX: 120,
  /** Escala operativa: 50 cajas × ~70 equipos ≈ 3500 series por recepción. */
  PX_SERIES_PER_RECEPTION_SOFT_MAX: 5000,
  /** Page size máximo en listados API v1. */
  API_PAGE_MAX: 200,
  /** Page size default listados. */
  API_PAGE_DEFAULT: 50,
} as const;

/** Default de cajas PX (override opcional vía NEXT_PUBLIC_PX_BOXES_DEFAULT). */
export function getPxBoxesDefault(): number {
  const fromEnv = parseInt(process.env.NEXT_PUBLIC_PX_BOXES_DEFAULT ?? '', 10);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) {
    return Math.min(fromEnv, BATCH_LIMITS.PX_BOXES_MAX);
  }
  return BATCH_LIMITS.PX_BOXES_DEFAULT;
}

/** Tamaño de lote promote PX (override vía NEXT_PUBLIC_PX_FINALIZE_BATCH_SIZE). */
export function getPxFinalizePromoteBatchSize(): number {
  const fromEnv = parseInt(process.env.NEXT_PUBLIC_PX_FINALIZE_BATCH_SIZE ?? '', 10);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) {
    return Math.min(fromEnv, BATCH_LIMITS.PX_EQUIPMENT_PER_OP);
  }
  return BATCH_LIMITS.PX_FINALIZE_PROMOTE_BATCH;
}

/** Tamaño de lote operate Taller (override vía NEXT_PUBLIC_WORKSHOP_OPERATE_BATCH). */
export function getWorkshopOperateBatchSize(): number {
  const fromEnv = parseInt(process.env.NEXT_PUBLIC_WORKSHOP_OPERATE_BATCH ?? '', 10);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) {
    return Math.min(fromEnv, BATCH_LIMITS.WORKSHOP_OPERATE_MAX_SERIES);
  }
  return BATCH_LIMITS.WORKSHOP_OPERATE_SERIES_BATCH;
}

/** Límite efectivo de cajas para una recepción PX. */
export function resolvePxBoxLimit(totalCajasEsperadas?: number | null): number {
  const raw = totalCajasEsperadas ?? 0;
  if (raw > 0) return Math.min(raw, BATCH_LIMITS.PX_BOXES_MAX);
  return getPxBoxesDefault();
}
