import type { IClassifyBatchGateway } from '../../domain/ports/classify-batch.gateway.port';
import type { ClassifyBatchResult } from '../../domain/types/equipment-unit.types';
import { ClassifyEquipmentBatchCommand } from './classify-equipment-batch.command';

/** C2A-02: solo RPC atómica; legacy bridge retirado. */
export class ClassifyEquipmentBatchHandler {
  constructor(private readonly rpcGateway: IClassifyBatchGateway) {}

  async execute(command: ClassifyEquipmentBatchCommand): Promise<ClassifyBatchResult> {
    if (!command.units.length) return { error: 'No hay equipos para clasificar.' };

    return this.rpcGateway.classifyBatch({
      receptionId: command.receptionId,
      sapTransferId: command.sapTransferId,
      units: command.units,
      registeredBy: command.registeredBy,
      correlationId: command.correlationId,
    });
  }
}
