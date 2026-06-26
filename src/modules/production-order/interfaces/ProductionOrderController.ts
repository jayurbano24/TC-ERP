import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  approveProductionOrderHex,
  assignOsToProductionOrderHex,
  createProductionOrderHex,
  listActiveProductionOrdersHex,
} from '../factory';
import { isHexagonalProductionOrderEnabledServer } from '../infrastructure/feature-flags';
import { parseJsonBody, parseOptionalJsonBody } from '@/shared/validation/parseRequest';

const operatorFields = {
  operatorId: z.string().nullish(),
  operatorName: z.string().max(160).optional(),
};

const createSchema = z.object({
  technologyId: z.string().min(1, 'technologyId es obligatorio.').max(120),
  modelId: z.string().min(1, 'modelId es obligatorio.').max(120),
  targetQuantity: z.coerce.number().int().positive(),
  notes: z.string().max(2000).optional(),
  ...operatorFields,
});

const assignOsSchema = z.object({
  serviceOrderId: z.string().min(1, 'serviceOrderId es obligatorio.').max(120),
});

const operatorOnlySchema = z.object({ ...operatorFields });

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

    const body = await parseJsonBody(request, createSchema);

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

    const body = await parseOptionalJsonBody(request, operatorOnlySchema);
    const result = await approveProductionOrderHex(poId, body.operatorName);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  }

  async assignOs(poId: string, request: Request): Promise<NextResponse> {
    const blocked = this.guard();
    if (blocked) return blocked;

    const body = await parseJsonBody(request, assignOsSchema);
    const result = await assignOsToProductionOrderHex(poId, body.serviceOrderId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  }
}
