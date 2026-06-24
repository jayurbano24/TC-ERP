export type DispatchBatchStatus = 'ABIERTO' | 'CERRADO' | 'DESPACHADO';

export type DispatchBatchSummary = {
  id: string;
  batchNumber: string;
  status: DispatchBatchStatus;
  destination: string | null;
  guideOutbound: string | null;
  openedByName: string | null;
  createdAt: string;
};

export type OpenDispatchBatchParams = {
  destination?: string;
  guideOutbound?: string;
  notes?: string;
  operatorId?: string | null;
  operatorName?: string;
};

export type OpenDispatchBatchResult =
  | { success: true; batchId: string; batchNumber: string; status: DispatchBatchStatus }
  | { success: false; error: string };

export type CloseDispatchBatchParams = {
  batchId: string;
  operatorId?: string | null;
  operatorName?: string;
};

export type CloseDispatchBatchResult =
  | { success: true; batchId: string; status: DispatchBatchStatus }
  | { success: false; error: string };

export type ListOpenDispatchBatchesResult =
  | { success: true; batches: DispatchBatchSummary[] }
  | { success: false; error: string };
