import type { BlockReturnFormData, BlockReturnResult } from '../types/equipment-unit.types';

export interface IBlockReturnGateway {
  blockReturn(
    sapTransferId: string,
    formData: BlockReturnFormData,
    currentUserFullName: string
  ): Promise<BlockReturnResult>;
}
