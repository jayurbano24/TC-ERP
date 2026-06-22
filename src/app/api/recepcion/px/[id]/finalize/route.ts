import { NextRequest, NextResponse } from 'next/server';
import { finalizePxReception } from '@/lib/database/pxReceptionCapture';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id: receptionId } = await context.params;
    const body = await req.json();
    const expectedVersion = Number(body.expectedVersion);

    if (!Number.isFinite(expectedVersion)) {
      return NextResponse.json(
        { success: false, error: 'expectedVersion es obligatorio.' },
        { status: 400 }
      );
    }

    const result = await finalizePxReception({
      receptionId,
      expectedVersion,
      varianceReason: body.varianceReason || body.variance_reason,
      operatorId: body.operatorId || null,
      operatorName: body.operatorName || 'OPERADOR',
    });

    if (!result.success) {
      const status = result.error.includes('Conflicto de versión') ? 409 : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json({ success: true, data: result.data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al finalizar recepción';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
