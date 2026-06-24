import { GenerateReportHandler } from './application/commands/generate-report.handler';
import { ListReportCatalogHandler } from './application/queries/list-report-catalog.handler';
import { CsvReportExporter } from './infrastructure/exporters/csv-report.exporter';
import { XlsxReportExporter } from './infrastructure/exporters/xlsx-report.exporter';
import {
  SupabaseReportCatalogRepository,
  SupabaseReportRunRepository,
} from './infrastructure/persistence/supabase-report.repository';
import type { ExportFormat, GenerateReportParams, ReportFilterParams } from './domain/types/report.types';

const catalogRepo = new SupabaseReportCatalogRepository();
const runRepo = new SupabaseReportRunRepository();
const exporters = [new XlsxReportExporter(), new CsvReportExporter()];

const listCatalogHandler = new ListReportCatalogHandler(catalogRepo);
const generateReportHandler = new GenerateReportHandler(catalogRepo, runRepo, exporters);

export async function listReportCatalogHex() {
  return listCatalogHandler.execute();
}

export async function generateReportHex(params: GenerateReportParams) {
  return generateReportHandler.execute(params);
}

export function parseReportFilters(body: Record<string, unknown>): ReportFilterParams {
  const str = (key: string) => {
    const v = body[key];
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };
  return {
    from: str('from'),
    to: str('to'),
    search: str('search'),
    guide: str('guide'),
    pilot: str('pilot'),
    courier: str('courier'),
    receivedBy: str('receivedBy'),
    status: str('status'),
    osLabel: str('osLabel'),
    sapDocument: str('sapDocument'),
    techId: str('techId'),
    brandId: str('brandId'),
    modelId: str('modelId'),
    agencyId: str('agencyId'),
    batchNumber: str('batchNumber'),
    batchId: str('batchId'),
  };
}

export function parseExportFormat(raw: unknown): ExportFormat {
  return raw === 'CSV' ? 'CSV' : 'XLSX';
}
