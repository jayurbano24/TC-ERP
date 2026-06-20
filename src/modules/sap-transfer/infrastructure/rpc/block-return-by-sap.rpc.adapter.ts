import { logAdvancedAudit } from '@/lib/database/audit';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { IBlockReturnGateway } from '../../domain/ports/block-return.gateway.port';
import { SAP_TRANSFER_STATUS } from '../../domain/enums/sap-transfer-status.enum';
import type { BlockReturnFormData, BlockReturnResult } from '../../domain/types/equipment-unit.types';
import { formatSupabaseNetworkError } from '../audit';

export class BlockReturnBySapRpcAdapter implements IBlockReturnGateway {
  async blockReturn(
    sapTransferId: string,
    formData: BlockReturnFormData,
    currentUserFullName: string
  ): Promise<BlockReturnResult> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { error: 'Supabase not configured' };

    try {
      const { data, error } = await supabase.rpc('block_return_by_sap_transfer_tx', {
        p_sap_transfer_id: sapTransferId,
        p_motivo: formData.motivo,
        p_guia_salida: formData.guiaSalida,
        p_user: currentUserFullName,
        p_observaciones: formData.observaciones?.trim() || null,
      });

      if (error) return { error: error.message };

      const payload = (data || {}) as {
        units_count?: number;
        series_updated?: number;
        sap_document_number?: string;
      };

      await logAdvancedAudit({
        module: 'Logística',
        tableName: 'sap_transfer_documents',
        recordId: sapTransferId,
        action: 'DEVOLUCION_BLOQUE_SAP',
        newValues: {
          status: SAP_TRANSFER_STATUS.DEVUELTO_BLOQUE,
          units_count: payload.units_count ?? 0,
          series_updated: payload.series_updated ?? 0,
          motivo: formData.motivo,
          atomic: true,
        },
        observations: `Devolución en bloque atómica por Documento SAP ${payload.sap_document_number || sapTransferId} (${payload.units_count ?? 0} equipos).`,
      });

      return { success: true, unitsCount: payload.units_count ?? 0 };
    } catch (err) {
      return { error: formatSupabaseNetworkError(err, 'Error en devolución en bloque.') };
    }
  }
}
