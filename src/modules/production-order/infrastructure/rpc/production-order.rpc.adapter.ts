import { COUNT_HEAD, PRODUCTION_ORDER_SELECT } from '@/shared/constants/dbProjections';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { IProductionOrderGateway } from '../../domain/ports/production-order.gateway.port';
import type {
  ApproveProductionOrderResult,
  AssignOsToProductionOrderResult,
  CreateProductionOrderParams,
  CreateProductionOrderResult,
  ListProductionOrdersResult,
  ProductionOrderSummary,
} from '../../domain/types/production-order.types';

function mapRow(row: Record<string, unknown>, assignedCount = 0): ProductionOrderSummary {
  return {
    id: String(row.id),
    poNumber: String(row.po_number),
    status: row.status as ProductionOrderSummary['status'],
    targetQuantity: Number(row.target_quantity ?? 1),
    assignedCount,
    technologyId: row.technology_id ? String(row.technology_id) : null,
    modelId: row.model_id ? String(row.model_id) : null,
    requestedByName: row.requested_by_name ? String(row.requested_by_name) : null,
    notes: row.notes ? String(row.notes) : null,
    createdAt: String(row.created_at),
  };
}

export class ProductionOrderRpcAdapter implements IProductionOrderGateway {
  async create(params: CreateProductionOrderParams): Promise<CreateProductionOrderResult> {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase.rpc('production_order_create_tx', {
        p_technology_id: params.technologyId || null,
        p_model_id: params.modelId || null,
        p_target_quantity: params.targetQuantity ?? 1,
        p_notes: params.notes || null,
        p_operator_id: params.operatorId || null,
        p_operator_name: params.operatorName || 'Operador',
      });

      if (error) return { success: false, error: error.message };

      const payload = (data || {}) as { id?: string; po_number?: string; status?: string };
      if (!payload.id || !payload.po_number) {
        return { success: false, error: 'Respuesta inválida al crear PO.' };
      }

      return {
        success: true,
        id: payload.id,
        poNumber: payload.po_number,
        status: (payload.status as ProductionOrderSummary['status']) || 'BORRADOR',
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Error al crear PO.' };
    }
  }

  async approve(poId: string, operatorName?: string): Promise<ApproveProductionOrderResult> {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase.rpc('production_order_approve_tx', {
        p_po_id: poId,
        p_operator_name: operatorName || 'Supervisor',
      });

      if (error) return { success: false, error: error.message };

      const payload = (data || {}) as { id?: string; po_number?: string; status?: string };
      return {
        success: true,
        id: payload.id || poId,
        poNumber: String(payload.po_number || ''),
        status: (payload.status as ProductionOrderSummary['status']) || 'APROBADA',
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Error al aprobar PO.' };
    }
  }

  async assignServiceOrder(
    poId: string,
    serviceOrderId: string
  ): Promise<AssignOsToProductionOrderResult> {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase.rpc('production_order_assign_os_tx', {
        p_po_id: poId,
        p_service_order_id: serviceOrderId,
      });

      if (error) return { success: false, error: error.message };

      const payload = (data || {}) as {
        po_id?: string;
        service_order_id?: string;
        po_status?: string;
      };

      return {
        success: true,
        poId: payload.po_id || poId,
        serviceOrderId: payload.service_order_id || serviceOrderId,
        poStatus: (payload.po_status as ProductionOrderSummary['status']) || 'EN_PROCESO',
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Error al asignar OS.' };
    }
  }

  async listActive(): Promise<ListProductionOrdersResult> {
    try {
      const supabase = getSupabaseServerClient();
      const { data, error } = await supabase
        .from('production_orders')
        .select(PRODUCTION_ORDER_SELECT)
        .in('status', ['BORRADOR', 'APROBADA', 'EN_PROCESO'])
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) return { success: false, error: error.message };

      const orders: ProductionOrderSummary[] = [];
      for (const row of data || []) {
        const { count } = await supabase
          .from('service_orders')
          .select(COUNT_HEAD, { count: 'exact', head: true })
          .eq('production_order_id', row.id);
        orders.push(mapRow(row as Record<string, unknown>, count || 0));
      }

      return { success: true, orders };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Error al listar PO.' };
    }
  }
}
