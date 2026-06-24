import { NextResponse } from 'next/server';
import type { CacTrayQueryParams } from '@/lib/backoffice/cacTrayTypes';
import { queryCacTrayStats } from '@/lib/database/cacTrayUnits';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';

export const dynamic = 'force-dynamic';

function parseStatsParams(url: URL): CacTrayQueryParams {
  const sp = url.searchParams;
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

export const GET = withErrorHandler(
  async (req: Request) => {
    const result = await queryCacTrayStats(parseStatsParams(new URL(req.url)));
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=30, stale-while-revalidate=120' },
    });
  },
  { module: 'backoffice', action: 'cac-history.stats' }
);
