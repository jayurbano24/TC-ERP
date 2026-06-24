import type {
  ApproveProductionOrderResult,
  AssignOsToProductionOrderResult,
  CreateProductionOrderParams,
  CreateProductionOrderResult,
  ListProductionOrdersResult,
} from '../types/production-order.types';

export interface IProductionOrderGateway {
  create(params: CreateProductionOrderParams): Promise<CreateProductionOrderResult>;
  approve(poId: string, operatorName?: string): Promise<ApproveProductionOrderResult>;
  assignServiceOrder(poId: string, serviceOrderId: string): Promise<AssignOsToProductionOrderResult>;
  listActive(): Promise<ListProductionOrdersResult>;
}
