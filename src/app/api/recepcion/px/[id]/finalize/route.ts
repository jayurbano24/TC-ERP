import { NextResponse } from 'next/server';
import { finalizePxReception } from '@/lib/database/pxReceptionCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { finalizeSchema } from '../../_schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { id: receptionId } = await context.params;
  const body = await parseJsonBody(req, finalizeSchema);

  const result = await finalizePxReception({
    receptionId,
    expectedVersion: body.expectedVersion,
    varianceReason: body.varianceReason || body.variance_reason,
    operatorId: body.operatorId || null,
    operatorName: body.operatorName || 'OPERADOR',
  });

  if (!result.success) {
    const status = result.error.includes('Conflicto de versión') ? 409 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json({ success: true, data: result.data });
}, { module: 'recepcion-px', action: 'finalize' });
