import { emitDomainEventServer } from '@/lib/database/domainEvents';
import type { IAccessoryDispatchGateway } from '../../domain/ports/accessory-dispatch.gateway.port';
import type { DispatchAccessoryOutResult } from '../../domain/types/accessory-dispatch.types';
import {
  ACCESSORIES_DISPATCH_EVENTS,
  ACCESSORIES_DISPATCH_EVENT_SOURCE,
} from '../../domain/events/accessory-dispatch.events';
import { DispatchAccessoryOutCommand } from './dispatch-accessory-out.command';

export class DispatchAccessoryOutHandler {
  constructor(private readonly gateway: IAccessoryDispatchGateway) {}

  async execute(command: DispatchAccessoryOutCommand): Promise<DispatchAccessoryOutResult> {
    const result = await this.gateway.dispatchOut(command.params);
    if (!result.success) return result;

    await emitDomainEventServer({
      eventType: ACCESSORIES_DISPATCH_EVENTS.DISPATCHED,
      aggregateType: 'accessory',
      aggregateId: command.params.accessoryId,
      correlationId: command.params.dispatchBatchId ?? command.params.accessoryId,
      source: ACCESSORIES_DISPATCH_EVENT_SOURCE,
      payload: {
        condition: command.params.condition,
        quantity: command.params.quantity,
        destination: command.params.destination,
        dispatchMode: result.dispatchMode,
        dispatchBatchId: command.params.dispatchBatchId ?? null,
        movementId: result.movementId ?? null,
      },
    });

    return result;
  }
}
