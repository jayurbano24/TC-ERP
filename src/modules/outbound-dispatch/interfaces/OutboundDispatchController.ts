import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  closeDispatchBatchHex,
  getOpenDispatchBatchesHex,
  openDispatchBatchHex,
} from '../factory';
import { isDispatchBatchApiEnabledServer } from '../infrastructure/feature-flags';
import { parseJsonBody, parseOptionalJsonBody } from '@/shared/validation/parseRequest';

const operatorFields = {
  operatorId: z.string().nullish(),
  operatorName: z.string().max(160).optional(),
};

const openSchema = z.object({
  destination: z.string().max(200).optional(),
  guideOutbound: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  ...operatorFields,
});

const operatorOnlySchema = z.object({ ...operatorFields });

export class OutboundDispatchController {
  async listOpen(): Promise<NextResponse> {
    if (!isDispatchBatchApiEnabledServer()) {
      return NextResponse.json(
        { success: false, error: 'API de lotes no activa (outbound o accessories dispatch)' },
        { status: 403 }
      );
    }

    const result = await getOpenDispatchBatchesHex();
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: result.batches });
  }

  async open(request: Request): Promise<NextResponse> {
    if (!isDispatchBatchApiEnabledServer()) {
      return NextResponse.json(
        { success: false, error: 'API de lotes no activa (outbound o accessories dispatch)' },
        { status: 403 }
      );
    }

    const body = await parseJsonBody(request, openSchema);

    const result = await openDispatchBatchHex({
      destination: body.destination,
      guideOutbound: body.guideOutbound,
      notes: body.notes,
      operatorId: body.operatorId,
      operatorName: body.operatorName,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result }, { status: 201 });
  }

  async close(batchId: string, request: Request): Promise<NextResponse> {
    if (!isDispatchBatchApiEnabledServer()) {
      return NextResponse.json(
        { success: false, error: 'API de lotes no activa (outbound o accessories dispatch)' },
        { status: 403 }
      );
    }

    const body = await parseOptionalJsonBody(request, operatorOnlySchema);

    const result = await closeDispatchBatchHex({
      batchId,
      operatorId: body.operatorId,
      operatorName: body.operatorName,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  }
}
