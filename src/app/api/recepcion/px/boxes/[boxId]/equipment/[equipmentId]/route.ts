import { NextRequest, NextResponse } from 'next/server';
import { voidPxEquipment } from '@/lib/database/pxReceptionCapture';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string; equipmentId: string }> };

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { boxId, equipmentId } = await context.params;
    const body = await req.json().catch(() => ({}));

    const receptionId = String(body.receptionId || '').trim();
    if (!receptionId) {
      return NextResponse.json(
        { success: false, error: 'receptionId es obligatorio.' },
        { status: 400 }
      );
    }

    const isPendingId = equipmentId.startsWith('pending-');
    const result = await voidPxEquipment({
      receptionId,
      boxId,
      equipmentId: isPendingId ? null : equipmentId,
      mainSerial: body.mainSerial || body.sn || (isPendingId ? body.mainSerial : null),
      operatorId: body.operatorId || null,
      operatorName: body.operatorName || 'OPERADOR',
    });

    if (!result.success) return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al eliminar equipo';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
