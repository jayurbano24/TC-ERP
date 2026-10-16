import type { ExportFormat, ReportDetailSheet, ReportRow, ReportXlsxLayout } from '../types/report.types';

export type ReportExportOptions = {
  xlsxLayout?: ReportXlsxLayout;
  detailSheets?: ReportDetailSheet[];
  /** Orden fijo de columnas (una celda por campo en Excel/CSV). */
  columns?: string[];
};

export interface IReportExporter {
  readonly format: ExportFormat;
  export(
    rows: ReportRow[],
    sheetName: string,
    options?: ReportExportOptions
  ): Promise<{ buffer: Buffer; mimeType: string; extension: string }>;
}
