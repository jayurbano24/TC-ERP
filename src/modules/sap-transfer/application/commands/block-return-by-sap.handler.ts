import type { IBlockReturnGateway } from '../../domain/ports/block-return.gateway.port';
import type { BlockReturnResult } from '../../domain/types/equipment-unit.types';
import { BlockReturnBySapCommand } from './block-return-by-sap.command';
import { isAtomicBlockReturnEnabled } from '../../infrastructure/feature-flags';

export class BlockReturnBySapHandler {
  constructor(
    private readonly rpcGateway: IBlockReturnGateway,
    private readonly legacyGateway: IBlockReturnGateway
  ) {}

  async execute(command: BlockReturnBySapCommand): Promise<BlockReturnResult> {
    const gateway = isAtomicBlockReturnEnabled() ? this.rpcGateway : this.legacyGateway;

    return gateway.blockReturn(
      command.sapTransferId,
      command.formData,
      command.currentUserFullName
    );
  }
}
