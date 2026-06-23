import { NextRequest, NextResponse } from 'next/server';
import { appendPxCaptureLots, type PxLotInput } from '@/lib/database/pxReceptionCapture';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ boxId: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { boxId } = await context.params;
    const body = await req.json();
    const lots = (body.lots || []) as PxLotInput[];

    const result = await appendPxCaptureLots(boxId, lots);
    if (!result.success) {
      return NextResponse.json(result, { status: 409 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al agregar lote';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
