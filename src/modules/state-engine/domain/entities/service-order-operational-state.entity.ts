import type { OperationalStateCode } from '../enums/operational-state-code.enum';

/**
 * Estado operativo actual de una orden de servicio (Motor 2).
 * Exactamente una fila por OS; refleja su única ubicación operativa.
 */
export interface ServiceOrderOperationalState {
  serviceOrderId: string;
  stateCode: OperationalStateCode;
  stateLabel: string;
  /** Canal de origen: cac | px | unknown. */
  sourceChannel: string | null;
  /** `current_status` de la serie primaria (si aplica). */
  seriesStatus: string | null;
  trayActive: boolean | null;
  trayExcluded: string | null;
  updatedAt: string;
}

/** Conteo de OS por estado para el snapshot KPI (Motor 4). */
export interface SnapshotKpiBucket {
  stateCode: string;
  stateLabel: string;
  osCount: number;
}

/**
 * Snapshot operativo reconciliado contra el libro mayor (Motor 1).
 * `reconciled` es true cuando snapshot y ledger cuadran (delta = 0).
 */
export interface OperationalSnapshot {
  ledgerTotal: number;
  snapshotTotal: number;
  delta: number;
  reconciled: boolean;
  buckets: SnapshotKpiBucket[];
}
