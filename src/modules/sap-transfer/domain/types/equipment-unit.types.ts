export type EquipmentUnitPayload = {
  main_serial: string;
  model_id: string;
  brand_id: string;
  all_series: string[];
  material?: string;
};

export type ClassifyBatchParams = {
  receptionId: string;
  sapTransferId: string;
  units: EquipmentUnitPayload[];
  registeredBy: string;
  /** Trazabilidad end-to-end del lote (Fase 2.5). */
  correlationId?: string;
};

export type BlockReturnFormData = {
  motivo: string;
  guiaSalida: string;
  observaciones?: string;
};

export type ClassifyUnitSkipError = {
  main_serial?: string;
  serial?: string;
  error?: string;
  active_os?: string;
  active_status?: string;
};

export type ClassifyBatchResult = {
  data?: unknown[];
  error?: string;
  /** Unidades omitidas por el RPC (p. ej. serie duplicada / OS activa). */
  skippedErrors?: ClassifyUnitSkipError[];
  unitsProcessed?: number;
  unitsSkipped?: number;
};

export type BlockReturnResult = {
  success?: boolean;
  unitsCount?: number;
  sapBase?: string;
  documentsCount?: number;
  documents?: string[];
  error?: string;
};
