export type ProductionOrderStatus =
  | 'BORRADOR'
  | 'APROBADA'
  | 'EN_PROCESO'
  | 'CERRADA'
  | 'CANCELADA';

export type ProductionOrderSummary = {
  id: string;
  poNumber: string;
  status: ProductionOrderStatus;
  targetQuantity: number;
  assignedCount?: number;
  technologyId: string | null;
  modelId: string | null;
  requestedByName: string | null;
  notes: string | null;
  createdAt: string;
};

export type CreateProductionOrderParams = {
  technologyId?: string | null;
  modelId?: string | null;
  targetQuantity?: number;
  notes?: string;
  operatorId?: string | null;
  operatorName?: string;
};

export type CreateProductionOrderResult =
  | { success: true; id: string; poNumber: string; status: ProductionOrderStatus }
  | { success: false; error: string };

export type ApproveProductionOrderResult =
  | { success: true; id: string; poNumber: string; status: ProductionOrderStatus }
  | { success: false; error: string };

export type AssignOsToProductionOrderResult =
  | { success: true; poId: string; serviceOrderId: string; poStatus: ProductionOrderStatus }
  | { success: false; error: string };

export type ListProductionOrdersResult =
  | { success: true; orders: ProductionOrderSummary[] }
  | { success: false; error: string };
