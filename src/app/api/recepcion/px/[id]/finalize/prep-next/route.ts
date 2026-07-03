import { NextResponse } from 'next/server';
import { finalizePxReceptionPrepStep } from '@/modules/recepcion/server/pxCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { finalizeSchema } from '../../../_schemas';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { id: receptionId } = await context.params;
  const body = await parseJsonBody(req, finalizeSchema);

  const result = await finalizePxReceptionPrepStep({
    receptionId,
    expectedVersion: body.expectedVersion,
  });

  if (!result.success) {
    const status = result.error.includes('Conflicto de versión') ? 409 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ success: true, data: result.data });
}, { module: 'recepcion-px', action: 'finalize-prep-next', roles: ROLES_RECEPCION });
