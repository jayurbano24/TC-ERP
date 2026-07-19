import type { IReportExporter, ReportExportOptions } from '../../domain/ports/report-exporter.port';
import type { ReportRow } from '../../domain/types/report.types';

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export class CsvReportExporter implements IReportExporter {
  readonly format = 'CSV' as const;

  async export(rows: ReportRow[], _sheetName: string, _options?: ReportExportOptions) {
    if (rows.length === 0) {
      const buffer = Buffer.from('', 'utf8');
      return { buffer, mimeType: 'text/csv; charset=utf-8', extension: 'csv' };
    }

    const headers = Object.keys(rows[0]);
    const lines = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) =>
        headers.map((h) => escapeCsv(String(row[h] ?? ''))).join(',')
      ),
    ];
    const buffer = Buffer.from(lines.join('\n'), 'utf8');
    return { buffer, mimeType: 'text/csv; charset=utf-8', extension: 'csv' };
  }
}
