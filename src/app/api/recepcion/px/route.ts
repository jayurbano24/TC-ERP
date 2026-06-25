import { NextRequest, NextResponse } from 'next/server';
import {
  listPxInProgressReceptions,
  joinOrStartPxReception,
  type PxStartInput,
} from '@/lib/database/pxReceptionCapture';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await listPxInProgressReceptions();
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al listar recepciones PX';
    console.error('GET /api/recepcion/px:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as PxStartInput;
    if (!body.guideData?.sap || !body.guideData?.proveedorPx) {
      return NextResponse.json(
        { success: false, error: 'Pedido SAP y Proveedor PX son obligatorios.' },
        { status: 400 }
      );
    }

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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al iniciar recepción PX';
    console.error('POST /api/recepcion/px:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
