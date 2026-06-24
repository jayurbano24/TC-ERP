import {
  closeDispatchBatch as legacyClose,
  openDispatchBatch as legacyOpen,
} from '@/lib/database/warehouse';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
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

/** Legacy: mismas RPC/tablas vía cliente browser (sin API hexagonal). */
export class DispatchBatchLegacyAdapter implements IDispatchBatchGateway {
  async openBatch(params: OpenDispatchBatchParams): Promise<OpenDispatchBatchResult> {
    const res = await legacyOpen(params.destination, params.guideOutbound, params.notes);
    if (res.error) return { success: false, error: res.error };
    if (!res.data) return { success: false, error: 'Respuesta inválida al abrir lote.' };

    return {
      success: true,
      batchId: res.data.batch_id,
      batchNumber: res.data.batch_number,
      status: (res.data.status as DispatchBatchSummary['status']) || 'ABIERTO',
    };
  }

  async closeBatch(params: CloseDispatchBatchParams): Promise<CloseDispatchBatchResult> {
    const res = await legacyClose(params.batchId);
    if (res.error) return { success: false, error: res.error };

    const payload = (res.data || {}) as { batch_id?: string; status?: string };
    return {
      success: true,
      batchId: payload.batch_id || params.batchId,
      status: (payload.status as DispatchBatchSummary['status']) || 'CERRADO',
    };
  }

  async listOpenBatches(): Promise<ListOpenDispatchBatchesResult> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { success: false, error: 'Supabase not configured' };

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
  }
}
