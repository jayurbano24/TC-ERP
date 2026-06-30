import { NextResponse } from 'next/server';
import { reopenPxBox } from '@/modules/recepcion/server/pxCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { reopenBoxSchema } from '../../../_schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export const POST = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { boxId } = await context.params;
  const body = await parseJsonBody(req, reopenBoxSchema);

  const result = await reopenPxBox({
    boxId,
    expectedVersion: body.expectedVersion,
    reason: body.reason,
    operatorId: body.operatorId || null,
    operatorName: body.operatorName || 'OPERADOR',
  });

  if (!result.success) return NextResponse.json(result, { status: 409 });
  return NextResponse.json({ success: true, data: result.data });
}, { module: 'recepcion-px', action: 'reopen-box', roles: ROLES_RECEPCION });
