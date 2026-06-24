import type { IBlockReturnGateway } from '../../domain/ports/block-return.gateway.port';
import type { BlockReturnResult } from '../../domain/types/equipment-unit.types';
import { BlockReturnBySapCommand } from './block-return-by-sap.command';

/** C2A-02: solo RPC atómica; legacy bridge retirado. */
export class BlockReturnBySapHandler {
  constructor(private readonly rpcGateway: IBlockReturnGateway) {}

  async execute(command: BlockReturnBySapCommand): Promise<BlockReturnResult> {
    return this.rpcGateway.blockReturn(
      command.sapTransferId,
      command.formData,
      command.currentUserFullName
    );
  }
}
