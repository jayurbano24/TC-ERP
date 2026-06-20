import { NextRequest, NextResponse } from 'next/server';
import type { CacTrayQueryParams } from '@/lib/backoffice/cacTrayTypes';
import { trayRowsToHistoryEntries } from '@/lib/backoffice/trayRowAdapter';
import { queryCacTrayAllFiltered } from '@/lib/database/cacTrayUnits';

export const dynamic = 'force-dynamic';

function parseExportParams(req: NextRequest): CacTrayQueryParams {
  const sp = req.nextUrl.searchParams;
  return {
    from: sp.get('from') || undefined,
    to: sp.get('to') || undefined,
    search: sp.get('search') || undefined,
    guide: sp.get('guide') || undefined,
    pilot: sp.get('pilot') || undefined,
    courier: sp.get('courier') || undefined,
    receivedBy: sp.get('receivedBy') || undefined,
    status: sp.get('status') || undefined,
    osLabel: sp.get('osLabel') || undefined,
    sapDocument: sp.get('sapDocument') || undefined,
    techId: sp.get('techId') || undefined,
    brandId: sp.get('brandId') || undefined,
    modelId: sp.get('modelId') || undefined,
    agencyId: sp.get('agencyId') || undefined,
  };
}

/** Filas listas para export (máx. 10k). */
export async function GET(req: NextRequest) {
  try {
    const rows = await queryCacTrayAllFiltered(parseExportParams(req));
    return NextResponse.json({
      entries: trayRowsToHistoryEntries(rows),
      count: rows.length,
      truncated: rows.length >= 10000,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al exportar historial CAC';
    console.error('cac-history/export:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
