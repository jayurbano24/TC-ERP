import { getSupabaseServerClient } from '@/lib/supabase/server';
import type {
  IReportCatalogRepository,
  IReportRunRepository,
} from '../../domain/ports/report-run.repository.port';
import type { ExportFormat, ReportFilterParams } from '../../domain/types/report.types';
import {
  STATIC_REPORT_CATALOG,
  resolveReportDefinitionColumns,
} from '../catalog/static-report-catalog';
import { fetchPrediagnosticoLiveExportColumns } from '../providers/prediagnostico-live-columns';

export class SupabaseReportRunRepository implements IReportRunRepository {
  async recordRun(input: {
    reportCode: string;
    userId?: string | null;
    userName?: string | null;
    filters: ReportFilterParams;
    format: ExportFormat;
    status: 'COMPLETED' | 'FAILED';
    rowCount?: number;
    errorMessage?: string;
  }): Promise<void> {
    try {
      const supabase = getSupabaseServerClient();
      await supabase.from('report_runs').insert({
        report_code: input.reportCode,
        user_id: input.userId || null,
        user_name: input.userName || null,
        filters: input.filters,
        format: input.format,
        status: input.status,
        row_count: input.rowCount ?? null,
        error_message: input.errorMessage ?? null,
      });
    } catch {
      // Auditoría best-effort; no bloquear export si la tabla aún no existe
    }
  }
}

async function enrichPrediagnosticoCatalogColumns<
  T extends { code: string; columns: string[]; description: string | null },
>(reports: T[]): Promise<T[]> {
  const live = await fetchPrediagnosticoLiveExportColumns().catch(() => null);
  if (!live?.length) return reports;
  return reports.map((r) =>
    r.code === 'PREDIAGNOSTICO_EQUIPOS'
      ? {
          ...r,
          columns: live,
          description:
            r.description ||
            'Formato SCA: columnas fijas + checks del catálogo activo + Clase + Observaciones (+ Número traslado SAP).',
        }
      : r
  );
}

export class SupabaseReportCatalogRepository implements IReportCatalogRepository {
  async listActive() {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase
        .from('report_definitions')
        .select('code, name, category, description, columns, requires_date_range')
        .eq('is_active', true)
        .order('category')
        .order('name');

      if (error || !data?.length) {
        return enrichPrediagnosticoCatalogColumns([...STATIC_REPORT_CATALOG]);
      }

      const fromDb = data.map((row) => ({
        code: row.code,
        name: row.name,
        category: row.category,
        description: row.description,
        columns: resolveReportDefinitionColumns(
          row.code,
          Array.isArray(row.columns) ? (row.columns as string[]) : []
        ),
        requiresDateRange: Boolean(row.requires_date_range),
      }));

      // Incluir códigos del fallback estático aún no sembrados en DB (ej. migraciones pendientes).
      const codes = new Set(fromDb.map((r) => r.code));
      const missing = STATIC_REPORT_CATALOG.filter((r) => !codes.has(r.code));
      const merged = [...fromDb, ...missing];
      return enrichPrediagnosticoCatalogColumns(merged);
    } catch {
      return enrichPrediagnosticoCatalogColumns([...STATIC_REPORT_CATALOG]);
    }
  }

  async getByCode(code: string) {
    const list = await this.listActive();
    return list.find((r) => r.code === code) ?? null;
  }
}
