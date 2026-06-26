import { NextResponse } from 'next/server';
import { capturePxEquipment } from '@/lib/database/pxReceptionCapture';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { parseJsonBody } from '@/shared/validation/parseRequest';
import { scanSchema } from '../../../_schemas';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export const POST = withErrorHandler(async (req: Request, context: RouteContext) => {
  const { boxId } = await context.params;
  const body = await parseJsonBody(req, scanSchema);

  const result = await capturePxEquipment({
    receptionId: body.receptionId,
    boxId,
    mainSerial: (body.mainSerial || body.sn)!,
    serialS2: body.serialS2 || body.s2 || undefined,
    serialS3: body.serialS3 || body.s3 || undefined,
    serialS4: body.serialS4 || body.s4 || undefined,
    brandId: body.brandId || null,
    modelId: body.modelId || null,
    material: body.material || null,
    operatorId: body.operatorId || null,
    operatorName: body.operatorName || 'OPERADOR',
    workstationLabel: body.workstationLabel || body.workstation || null,
  });

  if (!result.success) {
    return NextResponse.json(result, { status: 409 });
  }

  return NextResponse.json(result);
}, { module: 'recepcion-px', action: 'scan' });
