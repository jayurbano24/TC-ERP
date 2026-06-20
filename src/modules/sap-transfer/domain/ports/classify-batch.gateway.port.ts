import type { ClassifyBatchParams, ClassifyBatchResult } from '../types/equipment-unit.types';

export interface IClassifyBatchGateway {
  classifyBatch(params: ClassifyBatchParams): Promise<ClassifyBatchResult>;
}
