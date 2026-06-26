import { NextResponse } from 'next/server';
import { createPxCaptureBox } from '@/lib/database/pxReceptionCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { createBoxSchema } from '../../_schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const POST = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { id: receptionId } = await context.params;
  const { boxCode, lots } = await parseJsonBody(req, createBoxSchema);

  const result = await createPxCaptureBox(receptionId, boxCode, lots);
  if (!result.success) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json(result);
}, { module: 'recepcion-px', action: 'create-box' });
