import type { ExportFormat, ReportFilterParams } from '../types/report.types';

export interface IReportRunRepository {
  recordRun(input: {
    reportCode: string;
    userId?: string | null;
    userName?: string | null;
    filters: ReportFilterParams;
    format: ExportFormat;
    status: 'COMPLETED' | 'FAILED';
    rowCount?: number;
    errorMessage?: string;
  }): Promise<void>;
}

export interface IReportCatalogRepository {
  listActive(): Promise<
    Array<{
      code: string;
      name: string;
      category: string;
      description: string | null;
      columns: string[];
      requiresDateRange: boolean;
    }>
  >;
  getByCode(code: string): Promise<{
    code: string;
    name: string;
    category: string;
    description: string | null;
    columns: string[];
    requiresDateRange: boolean;
  } | null>;
}
