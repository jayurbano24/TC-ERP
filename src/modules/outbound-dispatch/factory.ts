import { OpenDispatchBatchHandler } from './application/commands/open-dispatch-batch.handler';
import { OpenDispatchBatchCommand } from './application/commands/open-dispatch-batch.command';
import { CloseDispatchBatchHandler } from './application/commands/close-dispatch-batch.handler';
import { CloseDispatchBatchCommand } from './application/commands/close-dispatch-batch.command';
import { GetOpenDispatchBatchesHandler } from './application/queries/get-open-dispatch-batches.handler';
import { GetOpenDispatchBatchesQuery } from './application/queries/get-open-dispatch-batches.handler';
import { DispatchBatchRpcAdapter } from './infrastructure/rpc/dispatch-batch.rpc.adapter';
import { DispatchBatchLegacyAdapter } from './infrastructure/legacy/dispatch-batch.legacy.adapter';
import type {
  CloseDispatchBatchParams,
  OpenDispatchBatchParams,
} from './domain/types/dispatch-batch.types';

const rpcGateway = new DispatchBatchRpcAdapter();
const legacyGateway = new DispatchBatchLegacyAdapter();

const openHandler = new OpenDispatchBatchHandler(rpcGateway);
const closeHandler = new CloseDispatchBatchHandler(rpcGateway);
const listHandler = new GetOpenDispatchBatchesHandler(rpcGateway);

const legacyOpenHandler = new OpenDispatchBatchHandler(legacyGateway);
const legacyCloseHandler = new CloseDispatchBatchHandler(legacyGateway);
const legacyListHandler = new GetOpenDispatchBatchesHandler(legacyGateway);

export async function openDispatchBatchHex(params: OpenDispatchBatchParams, useLegacy = false) {
  const handler = useLegacy ? legacyOpenHandler : openHandler;
  return handler.execute(OpenDispatchBatchCommand.from(params));
}

export async function closeDispatchBatchHex(params: CloseDispatchBatchParams, useLegacy = false) {
  const handler = useLegacy ? legacyCloseHandler : closeHandler;
  return handler.execute(
    new CloseDispatchBatchCommand(params.batchId, params.operatorId, params.operatorName)
  );
}

export async function getOpenDispatchBatchesHex(useLegacy = false) {
  const handler = useLegacy ? legacyListHandler : listHandler;
  return handler.execute(new GetOpenDispatchBatchesQuery());
}
