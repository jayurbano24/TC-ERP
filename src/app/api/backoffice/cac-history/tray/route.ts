import { NextResponse } from 'next/server';
import type { CacTrayQueryParams } from '@/lib/backoffice/cacTrayTypes';
import { queryCacTrayPage } from '@/modules/recepcion/server/cacTrayQueries';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { resolveReadClient } from '@/shared/infrastructure/http/resolveReadClient';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';

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
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { client } = resolveReadClient(auth.supabase);

    const url = new URL(req.url);
    const includeSapValidation = url.searchParams.get('includeSap') !== '0';
    const result = await queryCacTrayPage(parseTrayParams(url), {
      includeSapValidation,
      client,
    });
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  },
  { module: 'backoffice', action: 'cac-history.tray', roles: ROLES_RECEPCION }
);
