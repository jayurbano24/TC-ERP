import { NextResponse } from 'next/server';
import { getReceptionHistoryKpis } from '@/modules/recepcion/server/receptionReads';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withResolvedReadClient } from '@/shared/infrastructure/http/withResolvedReadClient';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async (req: Request) => {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;
  return withResolvedReadClient(auth, async () => {
    const data = await getReceptionHistoryKpis();
    return NextResponse.json({ success: true, data });
  });
}, { module: 'recepcion-history', action: 'kpis', roles: ROLES_RECEPCION });
