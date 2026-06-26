import { NextResponse } from 'next/server';
import { promotePxBox } from '@/lib/database/pxReceptionCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { parseOptionalJsonBody } from '@/shared/validation/parseRequest';
import { operatorOnlySchema } from '../../../_schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export const POST = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { boxId } = await context.params;
  const body = await parseOptionalJsonBody(req, operatorOnlySchema);

  const result = await promotePxBox({
    boxId,
    operatorId: body.operatorId || null,
    operatorName: body.operatorName || 'OPERADOR',
  });

  if (!result.success) return NextResponse.json(result, { status: 409 });
  return NextResponse.json({ success: true, data: result.data });
}, { module: 'recepcion-px', action: 'promote-box' });
