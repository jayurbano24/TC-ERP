import { NextResponse } from 'next/server';
import { voidPxEquipment } from '@/modules/recepcion/server/pxCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';
import { parseOptionalJsonBody } from '@/shared/validation/parseRequest';
import { voidEquipmentSchema } from '../../../../_schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string; equipmentId: string }> };

export const DELETE = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { boxId, equipmentId } = await context.params;
  const body = await parseOptionalJsonBody(req, voidEquipmentSchema);

  const isPendingId = equipmentId.startsWith('pending-');
  const result = await voidPxEquipment({
    receptionId: body.receptionId,
    boxId,
    equipmentId: isPendingId ? null : equipmentId,
    mainSerial: body.mainSerial || body.sn || null,
    operatorId: body.operatorId || null,
    operatorName: body.operatorName || 'OPERADOR',
  });

  if (!result.success) return NextResponse.json(result, { status: 409 });
  return NextResponse.json(result);
}, { module: 'recepcion-px', action: 'void-equipment', roles: ROLES_RECEPCION });
