import * as XLSX from 'xlsx';
import type { IReportExporter } from '../../domain/ports/report-exporter.port';
import type { ReportRow } from '../../domain/types/report.types';

export class XlsxReportExporter implements IReportExporter {
  readonly format = 'XLSX' as const;

  async export(rows: ReportRow[], sheetName: string) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return {
      buffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    };
  }
}
