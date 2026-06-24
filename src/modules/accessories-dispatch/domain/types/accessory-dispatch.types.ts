export type AccessoryCondition = 'NEW' | 'RECOVERED';
export type AccessoryDispatchMode = 'WITH_BATCH' | 'WITHOUT_BATCH';

export type DispatchAccessoryOutParams = {
  accessoryId: string;
  condition: AccessoryCondition;
  quantity: number;
  destination: string;
  notes?: string;
  dispatchBatchId?: string | null;
  boxId?: string | null;
  operatorId?: string | null;
};

export type DispatchAccessoryOutResult =
  | { success: true; movementId?: string; dispatchMode: AccessoryDispatchMode }
  | { success: false; error: string };
