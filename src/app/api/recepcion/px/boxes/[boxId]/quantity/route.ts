import { NextResponse } from 'next/server';
import { adjustPxBoxQuantity } from '@/lib/database/pxReceptionCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { adjustQuantitySchema } from '../../../_schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export const PATCH = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { boxId } = await context.params;
  const body = await parseJsonBody(req, adjustQuantitySchema);

  const result = await adjustPxBoxQuantity({
    boxId,
    newDeclaredQuantity: body.newDeclaredQuantity,
    reason: body.reason,
    expectedVersion: body.expectedVersion,
    operatorId: body.operatorId || null,
    operatorName: body.operatorName || 'OPERADOR',
  });

  if (!result.success) return NextResponse.json(result, { status: 409 });
  return NextResponse.json({ success: true, data: result.data });
}, { module: 'recepcion-px', action: 'adjust-quantity' });
