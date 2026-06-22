import { NextRequest, NextResponse } from 'next/server';
import { getPxReceptionSnapshot, updatePxReceptionHeader } from '@/lib/database/pxReceptionCapture';
import type { GuideData } from '@/app/(erp)/recepcion/types/reception.types';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const snapshot = await getPxReceptionSnapshot(id);
    if (!snapshot) {
      return NextResponse.json({ success: false, error: 'Recepción no encontrada.' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: snapshot });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al cargar recepción PX';
    console.error('GET /api/recepcion/px/[id]:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await req.json();
    const expectedVersion = Number(body.expectedVersion);
    const guideData = body.guideData as GuideData;
    const operatorName = String(body.operatorName || 'OPERADOR');

    if (!guideData?.sap || !guideData?.proveedorPx) {
      return NextResponse.json(
        { success: false, error: 'Número de pedido y proveedor PX son obligatorios.' },
        { status: 400 }
      );
    }
    if (!Number.isFinite(expectedVersion)) {
      return NextResponse.json(
        { success: false, error: 'expectedVersion es obligatorio.' },
        { status: 400 }
      );
    }

    const result = await updatePxReceptionHeader({
      receptionId: id,
      guideData,
      operatorName,
      expectedVersion,
    });

    if (!result.success) {
      return NextResponse.json(result, { status: 409 });
    }

    const snapshot = await getPxReceptionSnapshot(id);
    return NextResponse.json({ success: true, version: result.version, data: snapshot });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error al actualizar cabecera';
    console.error('PATCH /api/recepcion/px/[id]:', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
