import { NextRequest, NextResponse } from 'next/server';
import { adjustPxBoxQuantity } from '@/lib/database/pxReceptionCapture';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { boxId } = await context.params;
    const body = await req.json();
    const newQty = Number(body.newDeclaredQuantity);
    const expectedVersion = Number(body.expectedVersion);
    const reason = String(body.reason || '').trim();

    if (!reason || !Number.isFinite(newQty) || !Number.isFinite(expectedVersion)) {
      return NextResponse.json(
        { success: false, error: 'newDeclaredQuantity, expectedVersion y reason son obligatorios.' },
        { status: 400 }
      );
    }

    const result = await adjustPxBoxQuantity({
      boxId,
      newDeclaredQuantity: newQty,
      reason,
      expectedVersion,
      operatorId: body.operatorId || null,
      operatorName: body.operatorName || 'OPERADOR',
    });

    if (!result.success) return NextResponse.json(result, { status: 409 });
    return NextResponse.json({ success: true, data: result.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al ajustar cantidad';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
