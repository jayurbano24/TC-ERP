import { SapTransferReturnPortAdapter } from '@/modules/sap-transfer/infrastructure/adapters/sap-transfer-return.port.adapter';
import { RegisterIndividualReturnHandler } from './application/commands/register-individual-return.handler';
import { RegisterIndividualReturnCommand } from './application/commands/register-individual-return.command';
import { ProcessBlockReturnBySapHandler } from './application/commands/process-block-return-by-sap.handler';
import { ProcessBlockReturnBySapCommand } from './application/commands/process-block-return-by-sap.command';
import type { IndividualReturnEntry } from './domain/types/return.types';
import type { BlockReturnFormData } from '@/modules/sap-transfer';

const sapTransferReturnPort = new SapTransferReturnPortAdapter();
const registerIndividualHandler = new RegisterIndividualReturnHandler(sapTransferReturnPort);
const processBlockReturnHandler = new ProcessBlockReturnBySapHandler(sapTransferReturnPort);

export async function registerIndividualReturnHex(entry: IndividualReturnEntry) {
  return registerIndividualHandler.execute(new RegisterIndividualReturnCommand(entry));
}

export async function processBlockReturnBySapTransferHex(
  sapTransferId: string,
  formData: BlockReturnFormData,
  currentUserFullName: string
) {
  return processBlockReturnHandler.execute(
    new ProcessBlockReturnBySapCommand(sapTransferId, formData, currentUserFullName)
  );
}
