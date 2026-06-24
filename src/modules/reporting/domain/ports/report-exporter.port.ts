import type { ExportFormat, ReportRow } from '../types/report.types';

export interface IReportExporter {
  readonly format: ExportFormat;
  export(rows: ReportRow[], sheetName: string): Promise<{ buffer: Buffer; mimeType: string; extension: string }>;
}
