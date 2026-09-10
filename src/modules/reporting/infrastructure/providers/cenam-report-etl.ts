import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportDataResult, ReportFilterParams, ReportRow } from '../../domain/types/report.types';
import { enrichCenamSnapshotPayload } from './cenam-report-enrichment';
import { parseMonthFilter } from './ops-monthly-tech-report.provider';

type CenamSnapshotRpc = {
  stale?: boolean;
  reason?: string;
  refreshed_at?: string;
  refresh_ms?: number;
  ingresos?: ReportRow[];
  entregado?: ReportRow[];
  irreparables?: ReportRow[];
  matrix?: ReportRow[];
};

function jsonRows(value: unknown): ReportRow[] {
  if (!Array.isArray(value)) return [];
  return value as ReportRow[];
}

function hasExportData(matrix: ReportRow[], ingresos: ReportRow[], irreparables: ReportRow[]): boolean {
  const matrixHasCounts = matrix.some((r) =>
    [
      'Recuperados CACs',
      'Recuperados PX',
      'Obsoleto CACs',
      'Obsoleto PX',
      'Reparado CACs',
      'Reparado PX',
      'Reacondicionado CACs',
      'Reacondicionado PX',
    ].some((k) => typeof r[k] === 'number' && (r[k] as number) > 0),
  );
  return matrixHasCounts || ingresos.length > 0 || irreparables.length > 0;
}

/**
 * Lee snapshot ETL en Postgres (refresh + get). Una sola transacción SQL por mes.
 * Retorna null si la migración 243 aún no está aplicada.
 */
export async function fetchCenamReportFromEtl(
  supabase: SupabaseClient,
  filters: ReportFilterParams,
): Promise<ReportDataResult | null> {
  const now = new Date();
  const year = Number(filters.year) || now.getFullYear();
  const month = parseMonthFilter(filters.month);
  if (!month) {
    throw new Error('CENAM Refurbished requiere seleccionar un mes específico (no exporte el año completo).');
  }
  const country = (filters.country || 'GT').trim().toUpperCase() || 'GT';

  const readSnapshot = async (): Promise<CenamSnapshotRpc | null> => {
    const { data, error } = await supabase.rpc('get_cenam_report_snapshot', {
      p_year: year,
      p_country: country,
      p_month: month,
      p_max_age_minutes: 120,
    });
    if (error) {
      if (/function.*does not exist|Could not find/i.test(error.message)) return null;
      throw new Error(error.message);
    }
    return (data as CenamSnapshotRpc | null) ?? null;
  };

  const needsFieldRefresh = (rows: ReportRow[] | undefined): boolean =>
    Boolean(rows?.length) && !rows.some((r) => r._osId != null || String(r.S1 ?? '').trim() !== '');

  let snapshot = await readSnapshot();
  if (snapshot === null) return null;

  const staleOrLegacy =
    snapshot.stale ||
    needsFieldRefresh(snapshot.ingresos) ||
    needsFieldRefresh(snapshot.entregado);

  if (staleOrLegacy) {
    const { error: refreshError } = await supabase.rpc('refresh_cenam_report_snapshot', {
      p_year: year,
      p_country: country,
      p_month: month,
    });
    if (refreshError) {
      if (/function.*does not exist|Could not find/i.test(refreshError.message)) return null;
      throw new Error(refreshError.message);
    }
    snapshot = await readSnapshot();
  }

  if (!snapshot || snapshot.stale) {
    throw new Error('No se pudo construir el snapshot CENAM. Intente de nuevo.');
  }

  const enriched = await enrichCenamSnapshotPayload(supabase, {
    matrix: jsonRows(snapshot.matrix),
    ingresos: jsonRows(snapshot.ingresos),
    entregado: jsonRows(snapshot.entregado),
    irreparables: jsonRows(snapshot.irreparables),
  });

  if (!hasExportData(enriched.matrix, enriched.ingresos, enriched.irreparables)) {
    return { rows: [], xlsxLayout: 'cenam_refurbished' };
  }

  return {
    rows: enriched.matrix,
    xlsxLayout: 'cenam_refurbished',
    detailSheets: [
      { name: 'Libro 1 - Ingresos', rows: enriched.ingresos, layout: 'cenam_ingresos' },
      { name: 'Libro 2 - Entregado', rows: enriched.entregado, layout: 'cenam_entregado' },
      { name: 'Libro 3 - Irreparables', rows: enriched.irreparables, layout: 'cenam_irreparables' },
    ],
  };
}
