import type { ExportFormat, ReportRow, ReportXlsxLayout } from '../types/report.types';

export type ReportExportOptions = {
  xlsxLayout?: ReportXlsxLayout;
};

export interface IReportExporter {
  readonly format: ExportFormat;
  export(
    rows: ReportRow[],
    sheetName: string,
    options?: ReportExportOptions
  ): Promise<{ buffer: Buffer; mimeType: string; extension: string }>;
}
