import type { IDispatchBatchGateway } from '../../domain/ports/dispatch-batch.gateway.port';
import type { ListOpenDispatchBatchesResult } from '../../domain/types/dispatch-batch.types';

export class GetOpenDispatchBatchesQuery {}

export class GetOpenDispatchBatchesHandler {
  constructor(private readonly gateway: IDispatchBatchGateway) {}

  async execute(_query: GetOpenDispatchBatchesQuery): Promise<ListOpenDispatchBatchesResult> {
    return this.gateway.listOpenBatches();
  }
}
