import { NextResponse } from 'next/server';
import { getReceptionHistoryKpis } from '@/modules/recepcion/server/receptionReads';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  const data = await getReceptionHistoryKpis();
  return NextResponse.json({ success: true, data });
}, { module: 'recepcion-history', action: 'kpis', roles: ROLES_RECEPCION });
