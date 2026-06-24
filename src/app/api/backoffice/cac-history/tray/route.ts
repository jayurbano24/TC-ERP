import { NextResponse } from 'next/server';
import type { CacTrayQueryParams } from '@/lib/backoffice/cacTrayTypes';
import { queryCacTrayPage } from '@/lib/database/cacTrayUnits';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';

export const dynamic = 'force-dynamic';

function parseTrayParams(url: URL): CacTrayQueryParams {
  const sp = url.searchParams;
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

export const GET = withErrorHandler(
  async (req: Request) => {
    const url = new URL(req.url);
    const includeSapValidation = url.searchParams.get('includeSap') !== '0';
    const result = await queryCacTrayPage(parseTrayParams(url), { includeSapValidation });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=60' },
    });
  },
  { module: 'backoffice', action: 'cac-history.tray' }
);
