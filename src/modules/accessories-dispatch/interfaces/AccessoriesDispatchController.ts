import { dispatchAccessoryOutHex } from '../factory';
import { isHexagonalAccessoriesDispatchEnabledServer } from '../infrastructure/feature-flags';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/shared/validation/parseRequest';

const dispatchOutSchema = z.object({
  accessoryId: z.string().min(1, 'accessoryId es obligatorio.').max(120),
  condition: z.enum(['RECOVERED', 'NEW']).optional().default('NEW'),
  quantity: z.coerce.number().int().positive(),
  destination: z.string().min(1, 'destination es obligatorio.').max(200),
  notes: z.string().max(2000).optional(),
  dispatchBatchId: z.string().nullish(),
  boxId: z.string().nullish(),
  operatorId: z.string().nullish(),
});

export class AccessoriesDispatchController {
  async dispatchOut(request: Request): Promise<NextResponse> {
    if (!isHexagonalAccessoriesDispatchEnabledServer()) {
      return NextResponse.json(
        { success: false, error: 'USE_HEXAGONAL_ACCESSORIES_DISPATCH no está activo' },
        { status: 403 }
      );
    }

    const body = await parseJsonBody(request, dispatchOutSchema);
    const result = await dispatchAccessoryOutHex({
      accessoryId: body.accessoryId,
      condition: body.condition,
      quantity: body.quantity,
      destination: body.destination,
      notes: body.notes,
      dispatchBatchId: body.dispatchBatchId || null,
      boxId: body.boxId || null,
      operatorId: body.operatorId || null,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  }
}
