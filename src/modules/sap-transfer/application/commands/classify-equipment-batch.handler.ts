import type { IClassifyBatchGateway } from '../../domain/ports/classify-batch.gateway.port';
import type { ClassifyBatchResult } from '../../domain/types/equipment-unit.types';
import { ClassifyEquipmentBatchCommand } from './classify-equipment-batch.command';
import { isAtomicClassifyEnabled } from '../../infrastructure/feature-flags';

export class ClassifyEquipmentBatchHandler {
  constructor(
    private readonly rpcGateway: IClassifyBatchGateway,
    private readonly legacyGateway: IClassifyBatchGateway
  ) {}

  async execute(command: ClassifyEquipmentBatchCommand): Promise<ClassifyBatchResult> {
    if (!command.units.length) return { error: 'No hay equipos para clasificar.' };

    const gateway = isAtomicClassifyEnabled() ? this.rpcGateway : this.legacyGateway;

    return gateway.classifyBatch({
      receptionId: command.receptionId,
      sapTransferId: command.sapTransferId,
      units: command.units,
      registeredBy: command.registeredBy,
    });
  }
}
