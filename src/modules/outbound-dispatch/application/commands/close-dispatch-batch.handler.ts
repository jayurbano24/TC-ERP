import { emitDomainEventServer } from '@/lib/database/domainEvents';
import type { IDispatchBatchGateway } from '../../domain/ports/dispatch-batch.gateway.port';
import type { CloseDispatchBatchResult } from '../../domain/types/dispatch-batch.types';
import { OUTBOUND_DOMAIN_EVENTS, OUTBOUND_EVENT_SOURCE } from '../../domain/events/outbound-domain-events';
import { CloseDispatchBatchCommand } from './close-dispatch-batch.command';

export class CloseDispatchBatchHandler {
  constructor(private readonly gateway: IDispatchBatchGateway) {}

  async execute(command: CloseDispatchBatchCommand): Promise<CloseDispatchBatchResult> {
    const result = await this.gateway.closeBatch({
      batchId: command.batchId,
      operatorId: command.operatorId,
      operatorName: command.operatorName,
    });

    if (!result.success) return result;

    await emitDomainEventServer({
      eventType: OUTBOUND_DOMAIN_EVENTS.BATCH_CLOSED,
      aggregateType: 'dispatch_batch',
      aggregateId: command.batchId,
      correlationId: command.batchId,
      source: OUTBOUND_EVENT_SOURCE,
      actorLabel: command.operatorName ?? null,
      payload: { batchId: command.batchId, status: result.status },
    });

    return result;
  }
}
