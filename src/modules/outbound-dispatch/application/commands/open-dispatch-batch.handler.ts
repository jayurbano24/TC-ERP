import type { IDispatchBatchGateway } from '../../domain/ports/dispatch-batch.gateway.port';
import type { OpenDispatchBatchResult } from '../../domain/types/dispatch-batch.types';
import { OpenDispatchBatchCommand } from './open-dispatch-batch.command';

export class OpenDispatchBatchHandler {
  constructor(private readonly gateway: IDispatchBatchGateway) {}

  async execute(command: OpenDispatchBatchCommand): Promise<OpenDispatchBatchResult> {
    return this.gateway.openBatch({
      destination: command.destination,
      guideOutbound: command.guideOutbound,
      notes: command.notes,
      operatorId: command.operatorId,
      operatorName: command.operatorName,
    });
  }
}
