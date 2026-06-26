import { NextResponse } from 'next/server';
import { deletePxCaptureBox } from '@/lib/database/pxReceptionCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { deleteBoxSchema } from '../../_schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export const DELETE = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { boxId } = await context.params;
  const body = await parseJsonBody(req, deleteBoxSchema);

  const result = await deletePxCaptureBox({
    receptionId: body.receptionId,
    boxId,
    expectedVersion: body.expectedVersion,
    operatorId: body.operatorId || null,
    operatorName: body.operatorName || 'OPERADOR',
  });

  if (!result.success) return NextResponse.json(result, { status: 409 });
  return NextResponse.json(result);
}, { module: 'recepcion-px', action: 'delete-box' });
