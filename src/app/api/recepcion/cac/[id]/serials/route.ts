import { NextResponse } from 'next/server';
import { getCacReceptionGuideSerials } from '@/modules/recepcion/server/receptionReads';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: Request, context: RouteContext) => {
  const { id } = await context.params;
  const data = await getCacReceptionGuideSerials(id);
  return NextResponse.json({ success: true, data });
}, { module: 'recepcion-cac', action: 'serials', roles: ROLES_RECEPCION });
