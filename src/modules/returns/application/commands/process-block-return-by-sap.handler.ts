import type { BlockReturnFormData, BlockReturnResult } from '@/modules/sap-transfer';
import type { ISapTransferReturnPort } from '../../domain/ports/sap-transfer-return.port';
import { ProcessBlockReturnBySapCommand } from './process-block-return-by-sap.command';

export class ProcessBlockReturnBySapHandler {
  constructor(private readonly sapTransferReturnPort: ISapTransferReturnPort) {}

  async execute(command: ProcessBlockReturnBySapCommand): Promise<BlockReturnResult> {
    return this.sapTransferReturnPort.executeBlockReturn({
      sapTransferId: command.sapTransferId,
      formData: command.formData,
      currentUserFullName: command.currentUserFullName,
    });
  }
}
