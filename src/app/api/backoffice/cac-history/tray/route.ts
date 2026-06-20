import { NextRequest, NextResponse } from 'next/server';
import type { CacTrayQueryParams } from '@/lib/backoffice/cacTrayTypes';
import { queryCacTrayPage } from '@/lib/database/cacTrayUnits';

export const dynamic = 'force-dynamic';

function parseTrayParams(req: NextRequest): CacTrayQueryParams {
  const sp = req.nextUrl.searchParams;
  return {
    page: Number(sp.get('page') || '1'),
    limit: Number(sp.get('limit') || '25'),
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
    const result = await queryCacTrayPage(parseTrayParams(req));
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al cargar bandeja CAC';
    console.error('cac-history/tray:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
