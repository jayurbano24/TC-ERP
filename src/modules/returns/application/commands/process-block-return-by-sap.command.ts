import type { BlockReturnFormData } from '@/modules/sap-transfer';

export class ProcessBlockReturnBySapCommand {
  constructor(
    readonly sapTransferId: string,
    readonly formData: BlockReturnFormData,
    readonly currentUserFullName: string
  ) {}
}
