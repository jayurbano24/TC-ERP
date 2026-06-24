import { NextResponse } from 'next/server';
import {
  closeDispatchBatchHex,
  getOpenDispatchBatchesHex,
  openDispatchBatchHex,
} from '../factory';
import { isDispatchBatchApiEnabledServer } from '../infrastructure/feature-flags';

type OperatorPayload = {
  operatorId?: string | null;
  operatorName?: string;
};

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

    const body = (await request.json()) as OperatorPayload & {
      destination?: string;
      guideOutbound?: string;
      notes?: string;
    };

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

    const body = (await request.json().catch(() => ({}))) as OperatorPayload;

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
