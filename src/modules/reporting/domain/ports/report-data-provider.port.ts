import type { ReportDataResult, ReportFilterParams } from '../types/report.types';

export interface IReportDataProvider {
  readonly code: string;
  fetch(filters: ReportFilterParams): Promise<ReportDataResult>;
}
