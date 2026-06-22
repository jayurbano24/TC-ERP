import { NextRequest, NextResponse } from 'next/server';
import { createPxCaptureBox, type PxLotInput } from '@/lib/database/pxReceptionCapture';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id: receptionId } = await context.params;
    const body = await req.json();
    const boxCode = String(body.boxCode || '').trim();
    const lots = (body.lots || []) as PxLotInput[];

    if (!boxCode) {
      return NextResponse.json({ success: false, error: 'boxCode es obligatorio.' }, { status: 400 });
    }

    const result = await createPxCaptureBox(receptionId, boxCode, lots);
    if (!result.success) {
      return NextResponse.json(result, { status: 409 });
    }

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al crear caja PX';
    console.error('POST /api/recepcion/px/[id]/boxes:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
