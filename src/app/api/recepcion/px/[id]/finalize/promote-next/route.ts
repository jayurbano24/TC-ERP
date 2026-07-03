import { NextResponse } from 'next/server';
import {
  finalizePxReceptionPromoteStep,
  notifyPxReceptionFinalizeComplete,
} from '@/modules/recepcion/server/pxCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { finalizePromoteNextSchema } from '../../../_schemas';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { id: receptionId } = await context.params;
  const body = await parseJsonBody(req, finalizePromoteNextSchema);

  const result = await finalizePxReceptionPromoteStep({
    receptionId,
    expectedVersion: body.expectedVersion,
    varianceReason: body.varianceReason || body.variance_reason,
    operatorId: body.operatorId || null,
    operatorName: body.operatorName || 'OPERADOR',
    stampVariance: body.stampVariance,
  });

  if (!result.success) {
    const status = result.error.includes('Conflicto de versión') ? 409 : 400;
    return NextResponse.json(result, { status });
  }

  if (result.data.phase === 'done') {
    await notifyPxReceptionFinalizeComplete(receptionId, result.data.received_units);
  }

  return NextResponse.json({ success: true, data: result.data });
}, { module: 'recepcion-px', action: 'finalize-promote-next', roles: ROLES_RECEPCION });
