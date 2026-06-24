import type { BlockReturnFormData, BlockReturnResult } from '@/modules/sap-transfer';

export type SapTransferDocumentSummary = {
  id: string;
  sapDocumentNumber: string;
  status: string;
};

export type BlockReturnRequest = {
  sapTransferId: string;
  formData: BlockReturnFormData;
  currentUserFullName: string;
};

/** Puerto consumido por returns; implementado por sap-transfer (CHG-006). */
export interface ISapTransferReturnPort {
  countActiveUnits(sapTransferId: string): Promise<{ count: number; error?: string }>;
  getDocument(sapTransferId: string): Promise<{ document: SapTransferDocumentSummary | null; error?: string }>;
  executeBlockReturn(request: BlockReturnRequest): Promise<BlockReturnResult>;
}
