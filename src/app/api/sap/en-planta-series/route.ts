import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logOnlyRoleCheck, ROLES_RETURNS_SAP } from '@/shared/authz/roleGuard';
import { fetchEnPlantaSeriesExportRows } from '@/lib/sap/fetchEnPlantaSeriesExportRows';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_SERIES_ROWS = 500_000;

function excelResponse(
  rows: Awaited<ReturnType<typeof fetchEnPlantaSeriesExportRows>>['rows'],
  osCount: number,
  seriesCount: number,
) {
  const stamp = new Date().toISOString().slice(0, 10);
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 18 },
    { wch: 14 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
    { wch: 28 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'En planta');
  const summary = XLSX.utils.json_to_sheet([
    {
      'OS en planta': osCount,
      'Series en ledger': seriesCount,
      Criterio:
        'Una fila por OS única. Estatus operativo = tiles Inventario OS (Capacidad instalada).',
    },
  ]);
  XLSX.utils.book_append_sheet(wb, summary, 'Resumen');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sap-series-en-planta-${stamp}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Exporta todas las series de OS en planta (universo KPI «En planta»).
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(request);
  if (auth instanceof NextResponse) return auth;

  const denied = await logOnlyRoleCheck(request, ROLES_RETURNS_SAP, {
    module: 'sap',
    action: 'en_planta_series_export',
  });
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') || 'xlsx').toLowerCase();
  const db = getSupabaseServerClient();

  try {
    const { rows, osCount, seriesCount } = await fetchEnPlantaSeriesExportRows(db);
    if (osCount > MAX_SERIES_ROWS) {
      return NextResponse.json(
        {
          success: false,
          error: `Demasiadas OS (${osCount}). Máximo exportable: ${MAX_SERIES_ROWS.toLocaleString()}. Contacte soporte.`,
        },
        { status: 413 },
      );
    }

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        osCount,
        seriesCount,
        count: rows.length,
        data: rows,
      });
    }

    return excelResponse(rows, osCount, seriesCount);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
