import { NextRequest, NextResponse } from 'next/server';
import { promotePxBox } from '@/lib/database/pxReceptionCapture';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { boxId } = await context.params;
    const body = await req.json().catch(() => ({}));

    const result = await promotePxBox({
      boxId,
      operatorId: body.operatorId || null,
      operatorName: body.operatorName || 'OPERADOR',
    });

    if (!result.success) return NextResponse.json(result, { status: 409 });
    return NextResponse.json({ success: true, data: result.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al promover caja a bodega';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
