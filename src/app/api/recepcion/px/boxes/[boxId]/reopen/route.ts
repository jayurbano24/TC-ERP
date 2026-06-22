import { NextRequest, NextResponse } from 'next/server';
import { reopenPxBox } from '@/lib/database/pxReceptionCapture';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { boxId } = await context.params;
    const body = await req.json();
    const expectedVersion = Number(body.expectedVersion);

    if (!Number.isFinite(expectedVersion)) {
      return NextResponse.json(
        { success: false, error: 'expectedVersion es obligatorio.' },
        { status: 400 }
      );
    }

    const result = await reopenPxBox({
      boxId,
      expectedVersion,
      reason: body.reason,
      operatorId: body.operatorId || null,
      operatorName: body.operatorName || 'OPERADOR',
    });

    if (!result.success) return NextResponse.json(result, { status: 409 });
    return NextResponse.json({ success: true, data: result.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al reabrir caja';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
