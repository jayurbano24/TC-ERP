import type {
  CloseDispatchBatchParams,
  CloseDispatchBatchResult,
  ListOpenDispatchBatchesResult,
  OpenDispatchBatchParams,
  OpenDispatchBatchResult,
} from '../types/dispatch-batch.types';

export interface IDispatchBatchGateway {
  openBatch(params: OpenDispatchBatchParams): Promise<OpenDispatchBatchResult>;
  closeBatch(params: CloseDispatchBatchParams): Promise<CloseDispatchBatchResult>;
  listOpenBatches(): Promise<ListOpenDispatchBatchesResult>;
}
