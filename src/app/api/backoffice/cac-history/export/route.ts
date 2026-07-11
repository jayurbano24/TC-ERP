import { NextResponse } from 'next/server';
import type { CacTrayQueryParams } from '@/lib/backoffice/cacTrayTypes';
import { trayRowsToHistoryEntries } from '@/lib/backoffice/trayRowAdapter';
import { queryCacTrayAllFiltered } from '@/modules/recepcion/server/cacTrayQueries';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { resolveReadClient } from '@/shared/infrastructure/http/resolveReadClient';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

function parseExportParams(url: URL): CacTrayQueryParams {
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
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const { client } = resolveReadClient(auth.supabase);
    const rows = await queryCacTrayAllFiltered(parseExportParams(new URL(req.url)), 10000, client);
    return NextResponse.json({
      entries: trayRowsToHistoryEntries(rows),
      count: rows.length,
      truncated: rows.length >= 10000,
    });
  },
  { module: 'backoffice', action: 'cac-history.export', roles: ROLES_RECEPCION }
);
