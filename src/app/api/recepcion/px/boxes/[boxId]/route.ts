import { NextRequest, NextResponse } from 'next/server';
import { deletePxCaptureBox } from '@/lib/database/pxReceptionCapture';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { boxId } = await context.params;
    const body = await req.json();
    const receptionId = String(body.receptionId || '').trim();
    const expectedVersion = Number(body.expectedVersion);

    if (!receptionId) {
      return NextResponse.json(
        { success: false, error: 'receptionId es obligatorio.' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(expectedVersion)) {
      return NextResponse.json(
        { success: false, error: 'expectedVersion es obligatorio.' },
        { status: 400 }
      );
    }

    const result = await deletePxCaptureBox({
      receptionId,
      boxId,
      expectedVersion,
      operatorId: body.operatorId || null,
      operatorName: body.operatorName || 'OPERADOR',
    });

    if (!result.success) return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al eliminar caja';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
