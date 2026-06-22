import { logCacBackofficeAudit, CAC_AUDIT_ACTIONS } from '@/lib/database/cacBackofficeAudit';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { IBlockReturnGateway } from '../../domain/ports/block-return.gateway.port';
import {
  BLOCK_RETURN_ELIGIBLE_STATUSES,
  SAP_TRANSFER_STATUS,
} from '../../domain/enums/sap-transfer-status.enum';
import type { BlockReturnFormData, BlockReturnResult } from '../../domain/types/equipment-unit.types';
import { formatSupabaseNetworkError } from '../audit';

export class BlockReturnBySapLegacyAdapter implements IBlockReturnGateway {
  async blockReturn(
    sapTransferId: string,
    formData: BlockReturnFormData,
    currentUserFullName: string
  ): Promise<BlockReturnResult> {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { error: 'Supabase not configured' };

    try {
      const { data: sapTransfer, error: sapError } = await supabase
        .from('sap_transfer_documents')
        .select('*, reception_guides(guide_number)')
        .eq('id', sapTransferId)
        .single();

      if (sapError || !sapTransfer) return { error: 'Documento SAP no encontrado.' };

      const { data: seriesList, error: seriesError } = await supabase
        .from('series')
        .select('id, serial_number, current_status, notes, service_order_id')
        .eq('sap_transfer_id', sapTransferId);

      if (seriesError) return { error: seriesError.message };
      if (!seriesList?.length) {
        return { error: 'No hay equipos asociados a este Documento SAP.' };
      }

      const invalid = seriesList.filter(
        (s) =>
          !BLOCK_RETURN_ELIGIBLE_STATUSES.includes(
            s.current_status as (typeof BLOCK_RETURN_ELIGIBLE_STATUSES)[number]
          )
      );
      if (invalid.length > 0) {
        return {
          error: `Devolución en bloque: ${invalid.length} serie(s) en estado no permitido (${invalid[0]?.current_status}).`,
        };
      }

      const seriesToUpdate = seriesList.filter(
        (s) => s.current_status === 'RECEPCIONADO_BODEGA_GENERAL'
      );

      const equipmentCount = new Set(
        seriesList.map((s) => s.service_order_id).filter(Boolean)
      ).size;

      const returnNote =
        `--- DEVOLUCIÓN BLOQUE SAP ---\n` +
        `SAP: ${sapTransfer.sap_document_number}\n` +
        `Motivo: ${formData.motivo}\n` +
        `Guía Salida: ${formData.guiaSalida}\n` +
        `Cat: BODEGA DEVOLUCIÓN\n` +
        `Usuario: ${currentUserFullName}\n` +
        `Fecha: ${new Date().toLocaleString()}`;
      const updatedAt = new Date().toISOString();

      if (seriesToUpdate.length > 0) {
        const seriesIds = seriesToUpdate.map((s) => s.id);
        const CHUNK = 100;
        for (let i = 0; i < seriesIds.length; i += CHUNK) {
          const chunkIds = seriesIds.slice(i, i + CHUNK);
          const { error: updateSeriesError } = await supabase
            .from('series')
            .update({
              current_status: 'returned',
              notes: returnNote,
              updated_at: updatedAt,
            })
            .in('id', chunkIds);

          if (updateSeriesError) {
            return { error: `Error actualizando equipos: ${updateSeriesError.message}` };
          }
        }
      }

      const osIds = [...new Set(seriesList.map((s) => s.service_order_id).filter(Boolean))] as string[];
      if (osIds.length) {
        const { error: osError } = await supabase
          .from('service_orders')
          .update({ status: 'DEVUELTO' })
          .in('id', osIds);
        if (osError) {
          return { error: `Error actualizando órdenes de servicio: ${osError.message}` };
        }
      }

      const { error: sapUpdateError } = await supabase
        .from('sap_transfer_documents')
        .update({
          status: SAP_TRANSFER_STATUS.DEVUELTO_BLOQUE,
          updated_at: updatedAt,
        })
        .eq('id', sapTransferId);

      if (sapUpdateError) {
        return { error: `Error actualizando documento SAP: ${sapUpdateError.message}` };
      }

      await logCacBackofficeAudit({
        tableName: 'sap_transfer_documents',
        recordId: sapTransferId,
        action: CAC_AUDIT_ACTIONS.DEVOLUCION_BLOQUE_SAP,
        newValues: {
          status: SAP_TRANSFER_STATUS.DEVUELTO_BLOQUE,
          units_count: equipmentCount,
          motivo: formData.motivo,
          legacy: true,
        },
        observations: `Devolución en bloque por Documento SAP ${sapTransfer.sap_document_number} (${equipmentCount} equipos).`,
      });

      return { success: true, unitsCount: equipmentCount };
    } catch (err) {
      return { error: formatSupabaseNetworkError(err, 'Error en devolución en bloque.') };
    }
  }
}
