import { NextRequest, NextResponse } from 'next/server';
import { acquireBoxLock, releaseBoxLock } from '@/lib/database/pxReceptionCapture';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { boxId } = await context.params;
    const body = await req.json();
    const result = await acquireBoxLock({
      boxId,
      operatorId: body.operatorId || null,
      operatorName: body.operatorName || 'OPERADOR',
    });
    if (!result.success) return NextResponse.json(result, { status: 409 });
    return NextResponse.json({ success: true, ...result.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al tomar control de caja';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const { boxId } = await context.params;
    const body = await req.json().catch(() => ({}));
    const result = await releaseBoxLock({
      boxId,
      operatorId: body.operatorId || null,
      reason: body.reason || 'manual_release',
    });
    if (!result.success) return NextResponse.json(result, { status: 409 });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al liberar lock';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
