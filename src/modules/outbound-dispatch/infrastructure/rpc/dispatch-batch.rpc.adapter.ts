import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { asUuidOrNull } from '@/lib/database/warehouse';
import type { IDispatchBatchGateway } from '../../domain/ports/dispatch-batch.gateway.port';
import type {
  CloseDispatchBatchParams,
  CloseDispatchBatchResult,
  DispatchBatchSummary,
  ListOpenDispatchBatchesResult,
  OpenDispatchBatchParams,
  OpenDispatchBatchResult,
} from '../../domain/types/dispatch-batch.types';

function mapRow(row: Record<string, unknown>): DispatchBatchSummary {
  return {
    id: String(row.id),
    batchNumber: String(row.batch_number),
    status: row.status as DispatchBatchSummary['status'],
    destination: row.destination ? String(row.destination) : null,
    guideOutbound: row.guide_outbound ? String(row.guide_outbound) : null,
    openedByName: row.opened_by_name ? String(row.opened_by_name) : null,
    createdAt: String(row.created_at),
  };
}

function requireBrowserClient() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    throw new Error('Supabase no configurado');
  }
  return supabase;
}

export class DispatchBatchRpcAdapter implements IDispatchBatchGateway {
  async openBatch(params: OpenDispatchBatchParams): Promise<OpenDispatchBatchResult> {
    try {
      const supabase = requireBrowserClient();
      const { data, error } = await supabase.rpc('dispatch_batch_open_tx', {
        p_destination: params.destination || null,
        p_guide_outbound: params.guideOutbound || null,
        p_operator_id: asUuidOrNull(params.operatorId),
        p_operator_name: params.operatorName || 'Operador',
        p_notes: params.notes || null,
      });

      if (error) return { success: false, error: error.message };

      const payload = (data || {}) as { batch_id?: string; batch_number?: string; status?: string };
      if (!payload.batch_id || !payload.batch_number) {
        return { success: false, error: 'Respuesta inválida al abrir lote.' };
      }

      return {
        success: true,
        batchId: payload.batch_id,
        batchNumber: payload.batch_number,
        status: (payload.status as DispatchBatchSummary['status']) || 'ABIERTO',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al abrir lote.';
      return { success: false, error: message };
    }
  }

  async closeBatch(params: CloseDispatchBatchParams): Promise<CloseDispatchBatchResult> {
    try {
      const supabase = requireBrowserClient();
      const { data, error } = await supabase.rpc('dispatch_batch_close_tx', {
        p_batch_id: params.batchId,
        p_operator_id: asUuidOrNull(params.operatorId),
        p_operator_name: params.operatorName || 'Operador',
      });

      if (error) return { success: false, error: error.message };

      const payload = (data || {}) as { batch_id?: string; status?: string };
      return {
        success: true,
        batchId: payload.batch_id || params.batchId,
        status: (payload.status as DispatchBatchSummary['status']) || 'CERRADO',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al cerrar lote.';
      return { success: false, error: message };
    }
  }

  async listOpenBatches(): Promise<ListOpenDispatchBatchesResult> {
    try {
      const supabase = requireBrowserClient();
      const { data, error } = await supabase
        .from('dispatch_batches')
        .select('id, batch_number, status, destination, guide_outbound, opened_by_name, created_at')
        .eq('status', 'ABIERTO')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) return { success: false, error: error.message };

      return {
        success: true,
        batches: (data || []).map((row) => mapRow(row as Record<string, unknown>)),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error al listar lotes.';
      return { success: false, error: message };
    }
  }
}
