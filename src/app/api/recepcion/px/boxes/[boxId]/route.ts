import { NextResponse } from 'next/server';
import { deletePxCaptureBox, getPxBoxMeta } from '@/modules/recepcion/server/pxCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { deleteBoxSchema } from '../../_schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

/** Meta ligera (versión/lock/conteo) — no sustituye el snapshot completo. */
export const GET = withErrorHandler(async (_req: Request, context: RouteContext) => {
  const { boxId } = await context.params;
  const meta = await getPxBoxMeta(boxId);
  if (!meta) {
    return NextResponse.json({ success: false, error: 'Caja no encontrada.' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: meta });
}, { module: 'recepcion-px', action: 'get-box-meta', roles: ROLES_RECEPCION });

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
}, { module: 'recepcion-px', action: 'delete-box', roles: ROLES_RECEPCION });
