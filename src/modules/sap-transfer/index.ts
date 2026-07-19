export {
  classifyEquipmentBatch,
  processBlockReturnBySapTransfer,
} from './factory';

export type {
  EquipmentUnitPayload,
  ClassifyBatchParams,
  BlockReturnFormData,
  ClassifyBatchResult,
  BlockReturnResult,
} from './domain/types/equipment-unit.types';

export {
  SAP_TRANSFER_STATUS,
  BLOCK_RETURN_ELIGIBLE_STATUSES,
} from './domain/enums/sap-transfer-status.enum';

export type { SapTransferStatus } from './domain/enums/sap-transfer-status.enum';

export { sapDocumentBase } from './domain/sap-document-base';

export { ClassifyEquipmentBatchHandler } from './application/commands/classify-equipment-batch.handler';
export { BlockReturnBySapHandler } from './application/commands/block-return-by-sap.handler';

export type { IClassifyBatchGateway } from './domain/ports/classify-batch.gateway.port';
export type { IBlockReturnGateway } from './domain/ports/block-return.gateway.port';

export type { ISapTransferReturnPort } from '@/modules/returns/domain/ports/sap-transfer-return.port';
export { SapTransferReturnPortAdapter } from './infrastructure/adapters/sap-transfer-return.port.adapter';
