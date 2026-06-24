import type { ClassifyBatchParams } from '../../domain/types/equipment-unit.types';

export class ClassifyEquipmentBatchCommand {
  constructor(
    readonly receptionId: string,
    readonly sapTransferId: string,
    readonly units: ClassifyBatchParams['units'],
    readonly registeredBy: string,
    readonly correlationId?: string
  ) {}

  static from(params: ClassifyBatchParams): ClassifyEquipmentBatchCommand {
    return new ClassifyEquipmentBatchCommand(
      params.receptionId,
      params.sapTransferId,
      params.units,
      params.registeredBy,
      params.correlationId
    );
  }
}
