import { ProductionOrderRpcAdapter } from './infrastructure/rpc/production-order.rpc.adapter';
import type {
  CreateProductionOrderParams,
  ProductionOrderSummary,
} from './domain/types/production-order.types';

const gateway = new ProductionOrderRpcAdapter();

export async function createProductionOrderHex(params: CreateProductionOrderParams) {
  return gateway.create(params);
}

export async function approveProductionOrderHex(poId: string, operatorName?: string) {
  return gateway.approve(poId, operatorName);
}

export async function assignOsToProductionOrderHex(poId: string, serviceOrderId: string) {
  return gateway.assignServiceOrder(poId, serviceOrderId);
}

export async function listActiveProductionOrdersHex(): Promise<{
  success: boolean;
  orders?: ProductionOrderSummary[];
  error?: string;
}> {
  return gateway.listActive();
}
