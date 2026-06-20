import type { BlockReturnFormData } from '../../domain/types/equipment-unit.types';

export class BlockReturnBySapCommand {
  constructor(
    readonly sapTransferId: string,
    readonly formData: BlockReturnFormData,
    readonly currentUserFullName: string
  ) {}
}
