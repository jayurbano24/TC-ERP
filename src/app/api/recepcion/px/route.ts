import { NextResponse } from 'next/server';
import {
  listPxInProgressReceptions,
  joinOrStartPxReception,
} from '@/lib/database/pxReceptionCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { startReceptionSchema } from './_schemas';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandler(async () => {
  const data = await listPxInProgressReceptions();
  return NextResponse.json({ success: true, data });
}, { module: 'recepcion-px', action: 'list' });

export const POST = withErrorHandler(async (req: Request) => {
  const body = await parseJsonBody(req, startReceptionSchema);

  const result = await joinOrStartPxReception({
    guideData: body.guideData,
    operatorName: body.operatorName || 'OPERADOR_SISTEMA',
    operatorId: body.operatorId || null,
    preferredGuideNumber: body.preferredGuideNumber,
  });

  if (!result.success) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json({ ...result, success: true });
}, { module: 'recepcion-px', action: 'start' });
