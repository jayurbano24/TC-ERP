import { NextResponse } from 'next/server';
import { acquireBoxLock, releaseBoxLock } from '@/modules/recepcion/server/pxCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';
import { parseOptionalJsonBody } from '@/shared/validation/parseRequest';
import { operatorOnlySchema, releaseLockSchema } from '../../../_schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export const POST = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { boxId } = await context.params;
  const body = await parseOptionalJsonBody(req, operatorOnlySchema);

  const result = await acquireBoxLock({
    boxId,
    operatorId: body.operatorId || null,
    operatorName: body.operatorName || 'OPERADOR',
  });
  if (!result.success) return NextResponse.json(result, { status: 409 });
  return NextResponse.json({ success: true, ...result.data });
}, { module: 'recepcion-px', action: 'acquire-lock', roles: ROLES_RECEPCION });

export const DELETE = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { boxId } = await context.params;
  const body = await parseOptionalJsonBody(req, releaseLockSchema);

  const result = await releaseBoxLock({
    boxId,
    operatorId: body.operatorId || null,
    reason: body.reason || 'manual_release',
  });
  if (!result.success) return NextResponse.json(result, { status: 409 });
  return NextResponse.json({ success: true });
}, { module: 'recepcion-px', action: 'release-lock', roles: ROLES_RECEPCION });
