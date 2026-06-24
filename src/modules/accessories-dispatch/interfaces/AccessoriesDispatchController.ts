import { dispatchAccessoryOutHex } from '../factory';
import { isHexagonalAccessoriesDispatchEnabledServer } from '../infrastructure/feature-flags';
import { NextResponse } from 'next/server';

export class AccessoriesDispatchController {
  async dispatchOut(request: Request): Promise<NextResponse> {
    if (!isHexagonalAccessoriesDispatchEnabledServer()) {
      return NextResponse.json(
        { success: false, error: 'USE_HEXAGONAL_ACCESSORIES_DISPATCH no está activo' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const result = await dispatchAccessoryOutHex({
      accessoryId: String(body.accessoryId || ''),
      condition: body.condition === 'RECOVERED' ? 'RECOVERED' : 'NEW',
      quantity: Number(body.quantity || 0),
      destination: String(body.destination || ''),
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
