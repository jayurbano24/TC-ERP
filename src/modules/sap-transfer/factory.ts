import { ClassifyEquipmentBatchHandler } from './application/commands/classify-equipment-batch.handler';
import { ClassifyEquipmentBatchCommand } from './application/commands/classify-equipment-batch.command';
import { BlockReturnBySapHandler } from './application/commands/block-return-by-sap.handler';
import { BlockReturnBySapCommand } from './application/commands/block-return-by-sap.command';
import { ClassifyEquipmentBatchRpcAdapter } from './infrastructure/rpc/classify-equipment-batch.rpc.adapter';
import { ClassifyEquipmentBatchLegacyAdapter } from './infrastructure/legacy/classify-equipment-batch.legacy.adapter';
import { BlockReturnBySapRpcAdapter } from './infrastructure/rpc/block-return-by-sap.rpc.adapter';
import { BlockReturnBySapLegacyAdapter } from './infrastructure/legacy/block-return-by-sap.legacy.adapter';
import type { ClassifyBatchParams, BlockReturnFormData } from './domain/types/equipment-unit.types';

let classifyHandler: ClassifyEquipmentBatchHandler | null = null;
let blockReturnHandler: BlockReturnBySapHandler | null = null;

function getClassifyHandler(): ClassifyEquipmentBatchHandler {
  if (!classifyHandler) {
    classifyHandler = new ClassifyEquipmentBatchHandler(
      new ClassifyEquipmentBatchRpcAdapter(),
      new ClassifyEquipmentBatchLegacyAdapter()
    );
  }
  return classifyHandler;
}

function getBlockReturnHandler(): BlockReturnBySapHandler {
  if (!blockReturnHandler) {
    blockReturnHandler = new BlockReturnBySapHandler(
      new BlockReturnBySapRpcAdapter(),
      new BlockReturnBySapLegacyAdapter()
    );
  }
  return blockReturnHandler;
}

export async function classifyEquipmentBatch(params: ClassifyBatchParams) {
  return getClassifyHandler().execute(ClassifyEquipmentBatchCommand.from(params));
}

export async function processBlockReturnBySapTransfer(
  sapTransferId: string,
  formData: BlockReturnFormData,
  currentUserFullName: string
) {
  return getBlockReturnHandler().execute(
    new BlockReturnBySapCommand(sapTransferId, formData, currentUserFullName)
  );
}
