import { NextResponse } from 'next/server';
import { appendPxCaptureLots } from '@/lib/database/pxReceptionCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { appendLotsSchema } from '../../../_schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export const POST = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { boxId } = await context.params;
  const { lots } = await parseJsonBody(req, appendLotsSchema);

  const result = await appendPxCaptureLots(boxId, lots);
  if (!result.success) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json({ success: true, data: result });
}, { module: 'recepcion-px', action: 'append-lots' });
