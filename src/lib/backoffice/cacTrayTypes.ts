/** Fila del read-model cac_tray_units (API bandeja historial CAC). */
export type CacTrayUnitRow = {
  id: string;
  service_order_id: string;
  reception_id: string;
  sap_transfer_id: string | null;
  reception_guide_id: string | null;
  classified_at: string;
  os_label: string;
  os_number: number;
  guide_number: string;
  pilot_name: string | null;
  carrier: string | null;
  received_by_name: string | null;
  agency_code: string | null;
  agency_name: string | null;
  sap_document_number: string | null;
  unit_status: string;
  unit_status_label: string;
  reentry_count: number;
  tech_id: string | null;
  brand_id: string | null;
  model_id: string | null;
  serial_numbers: string[];
  series_ids: string[];
  /** Integración SAP a nivel OS (service_orders.sap_integration_status) */
  sap_integration_status?: string | null;
  /** sap_status por serie, mismo orden que serial_numbers / series_ids */
  series_sap_statuses?: (string | null)[];
};

export type CacTrayQueryParams = {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  search?: string;
  guide?: string;
  pilot?: string;
  courier?: string;
  receivedBy?: string;
  status?: string;
  osLabel?: string;
  sapDocument?: string;
  techId?: string;
  brandId?: string;
  modelId?: string;
  agencyId?: string;
};

export type CacTrayPageResponse = {
  rows: CacTrayUnitRow[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type CacTrayStatsResponse = {
  total: number;
  byTechId: Record<string, number>;
};

export type TransferEligibleItem = {
  seriesIds: string[];
  sn: string;
};
