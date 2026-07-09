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

export type ReportDataResult = {
  rows: ReportRow[];
  truncated?: boolean;
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
