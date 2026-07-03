import { NextResponse } from 'next/server';
import { getPxReceptionSnapshot, updatePxReceptionHeader } from '@/modules/recepcion/server/pxCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { updateHeaderSchema } from '../_schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export const GET = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { id } = await context.params;
  const includeEquipment = new URL(req.url).searchParams.get('includeEquipment') === '1';
  const snapshot = await getPxReceptionSnapshot(id, { includeEquipment });
  if (!snapshot) {
    return NextResponse.json({ success: false, error: 'Recepción no encontrada.' }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: snapshot });
}, { module: 'recepcion-px', action: 'get-snapshot' });

export const PATCH = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { id } = await context.params;
  const body = await parseJsonBody(req, updateHeaderSchema);

  const result = await updatePxReceptionHeader({
    receptionId: id,
    guideData: body.guideData,
    operatorName: String(body.operatorName || 'OPERADOR'),
    expectedVersion: body.expectedVersion,
  });

  if (!result.success) {
    return NextResponse.json(result, { status: 409 });
  }

  const snapshot = await getPxReceptionSnapshot(id, { includeEquipment: false });
  return NextResponse.json({ success: true, version: result.version, data: snapshot });
}, { module: 'recepcion-px', action: 'update-header', roles: ROLES_RECEPCION });
