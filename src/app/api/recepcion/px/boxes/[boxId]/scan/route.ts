import { NextRequest, NextResponse } from 'next/server';
import { capturePxEquipment } from '@/lib/database/pxReceptionCapture';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { boxId } = await context.params;
    const body = await req.json();

    const receptionId = String(body.receptionId || '').trim();
    const mainSerial = String(body.mainSerial || body.sn || '').trim();

    if (!receptionId || !mainSerial) {
      return NextResponse.json(
        { success: false, error: 'receptionId y mainSerial son obligatorios.' },
        { status: 400 }
      );
    }

    const result = await capturePxEquipment({
      receptionId,
      boxId,
      mainSerial,
      serialS2: body.serialS2 || body.s2,
      serialS3: body.serialS3 || body.s3,
      serialS4: body.serialS4 || body.s4,
      brandId: body.brandId || null,
      modelId: body.modelId || null,
      material: body.material || null,
      operatorId: body.operatorId || null,
      operatorName: body.operatorName || 'OPERADOR',
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al capturar equipo';
    console.error('POST /api/recepcion/px/boxes/[boxId]/scan:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
