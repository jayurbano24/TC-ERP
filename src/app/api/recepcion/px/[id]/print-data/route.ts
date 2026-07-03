import { NextResponse } from 'next/server';
import { getPxReceptionPrintData } from '@/modules/recepcion/server/receptionReads';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (_req: Request, context: RouteContext) => {
  const { id } = await context.params;
  const data = await getPxReceptionPrintData(id);
  return NextResponse.json({ success: true, data });
}, { module: 'recepcion-px', action: 'print-data', roles: ROLES_RECEPCION });
