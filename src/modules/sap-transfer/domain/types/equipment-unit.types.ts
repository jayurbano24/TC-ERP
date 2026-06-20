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
};

export type BlockReturnFormData = {
  motivo: string;
  guiaSalida: string;
  observaciones?: string;
};

export type ClassifyBatchResult = {
  data?: unknown[];
  error?: string;
};

export type BlockReturnResult = {
  success?: boolean;
  unitsCount?: number;
  error?: string;
};
