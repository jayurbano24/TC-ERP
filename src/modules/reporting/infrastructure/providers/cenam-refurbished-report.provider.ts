import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IReportDataProvider } from '../../domain/ports/report-data-provider.port';
import type { ReportDataResult, ReportFilterParams } from '../../domain/types/report.types';
import { fetchCenamReportFromEtl } from './cenam-report-etl';

const ETL_MIGRATION_HINT =
  'Aplique la migración 243_cenam_report_etl.sql en Supabase para habilitar el motor ETL del reporte.';

/**
 * CENAM Refurbished — 4 libros vía ETL Postgres (migración 243).
 * Un refresh SQL por mes; lecturas posteriores usan snapshot cacheado (≤2 h).
 */
export class CenamRefurbishedReportProvider implements IReportDataProvider {
  readonly code = 'CENAM_REFURBISHED';

  async fetch(filters: ReportFilterParams): Promise<ReportDataResult> {
    const supabase = getSupabaseServerClient();
    const etlResult = await fetchCenamReportFromEtl(supabase, filters);
    if (etlResult) return etlResult;
    throw new Error(ETL_MIGRATION_HINT);
  }
}
