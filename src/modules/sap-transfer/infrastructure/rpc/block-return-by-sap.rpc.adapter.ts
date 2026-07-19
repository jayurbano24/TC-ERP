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
        sap_base?: string;
        documents?: string[];
        documents_count?: number;
      };

      const sapBase = payload.sap_base || payload.sap_document_number || sapTransferId;

      await logAdvancedAudit({
        module: 'Logística',
        tableName: 'sap_transfer_documents',
        recordId: String(sapBase),
        action: 'DEVOLUCION_BLOQUE_SAP',
        newValues: {
          status: SAP_TRANSFER_STATUS.DEVUELTO_BLOQUE,
          sap_base: sapBase,
          documents: payload.documents || [],
          documents_count: payload.documents_count ?? 0,
          units_count: payload.units_count ?? 0,
          series_updated: payload.series_updated ?? 0,
          motivo: formData.motivo,
          guia_salida: formData.guiaSalida,
          atomic: true,
        },
        observations: `Devolución Bloque SAP base ${sapBase} · ${payload.documents_count ?? 0} documento(s) · ${payload.units_count ?? 0} equipo(s). Motivo: ${formData.motivo}`,
      });

      return {
        success: true,
        unitsCount: payload.units_count ?? 0,
        sapBase,
        documentsCount: payload.documents_count ?? 0,
        documents: payload.documents || [],
      };
    } catch (err) {
      return { error: formatSupabaseNetworkError(err, 'Error en devolución en bloque.') };
    }
  }
}
