import { NextResponse } from 'next/server';
import {
  approveProductionOrderHex,
  assignOsToProductionOrderHex,
  createProductionOrderHex,
  listActiveProductionOrdersHex,
} from '../factory';
import { isHexagonalProductionOrderEnabledServer } from '../infrastructure/feature-flags';

type OperatorPayload = {
  operatorId?: string | null;
  operatorName?: string;
};

export class ProductionOrderController {
  private guard() {
    if (!isHexagonalProductionOrderEnabledServer()) {
      return NextResponse.json(
        { success: false, error: 'USE_HEXAGONAL_PRODUCTION_ORDER no está activo' },
        { status: 403 }
      );
    }
    return null;
  }

  async list(): Promise<NextResponse> {
    const blocked = this.guard();
    if (blocked) return blocked;

    const result = await listActiveProductionOrdersHex();
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, data: result.orders });
  }

  async create(request: Request): Promise<NextResponse> {
    const blocked = this.guard();
    if (blocked) return blocked;

    const body = (await request.json()) as OperatorPayload & {
      technologyId?: string;
      modelId?: string;
      targetQuantity?: number;
      notes?: string;
    };

    const result = await createProductionOrderHex({
      technologyId: body.technologyId,
      modelId: body.modelId,
      targetQuantity: body.targetQuantity,
      notes: body.notes,
      operatorId: body.operatorId,
      operatorName: body.operatorName,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  }

  async approve(poId: string, request: Request): Promise<NextResponse> {
    const blocked = this.guard();
    if (blocked) return blocked;

    const body = (await request.json().catch(() => ({}))) as OperatorPayload;
    const result = await approveProductionOrderHex(poId, body.operatorName);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  }

  async assignOs(poId: string, request: Request): Promise<NextResponse> {
    const blocked = this.guard();
    if (blocked) return blocked;

    const body = (await request.json()) as { serviceOrderId?: string };
    if (!body.serviceOrderId) {
      return NextResponse.json({ success: false, error: 'serviceOrderId es obligatorio' }, { status: 400 });
    }

    const result = await assignOsToProductionOrderHex(poId, body.serviceOrderId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  }
}
