export type ExportFormat = 'XLSX' | 'CSV';

export type ReportFilterParams = {
  from?: string;
  to?: string;
  /** When true, skip required date range and export the full dataset. */
  allData?: boolean;
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
  batchNumber?: string;
  batchId?: string;
  /** Filtros reporte matriz mensual (OPERACIONES_MENSUAL_TECNOLOGIA). */
  year?: string;
  month?: string;
  country?: string;
  technology?: string;
};

export type ReportRow = Record<string, string | number | null>;

export type ReportDefinitionSummary = {
  code: string;
  name: string;
  category: string;
  description: string | null;
  columns: string[];
  requiresDateRange: boolean;
};

/** Layout Excel con cabeceras agrupadas (Año/País/Mes/Tech + Ingresado/…). */
export type ReportXlsxLayout = 'default' | 'ops_monthly_tech_matrix';

export type ReportDataResult = {
  rows: ReportRow[];
  truncated?: boolean;
  xlsxLayout?: ReportXlsxLayout;
};

export type GenerateReportParams = {
  reportCode: string;
  format: ExportFormat;
  filters: ReportFilterParams;
  userId?: string | null;
  userName?: string | null;
};

export type GenerateReportResult =
  | {
      success: true;
      buffer: Buffer;
      mimeType: string;
      filename: string;
      rowCount: number;
    }
  | { success: false; error: string };
