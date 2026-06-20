import { NextRequest, NextResponse } from 'next/server';
import type { CacTrayQueryParams } from '@/lib/backoffice/cacTrayTypes';
import { queryCacTrayStats } from '@/lib/database/cacTrayUnits';

export const dynamic = 'force-dynamic';

function parseStatsParams(req: NextRequest): CacTrayQueryParams {
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

export async function GET(req: NextRequest) {
  try {
    const result = await queryCacTrayStats(parseStatsParams(req));
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al cargar estadísticas CAC';
    console.error('cac-history/stats:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
