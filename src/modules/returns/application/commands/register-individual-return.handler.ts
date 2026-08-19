import { logAdvancedAudit } from '@/lib/database/audit';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { ISapTransferReturnPort } from '../../domain/ports/sap-transfer-return.port';
import type { IndividualReturnEntry, IndividualReturnResult } from '../../domain/types/return.types';
import { RegisterIndividualReturnCommand } from './register-individual-return.command';

export class RegisterIndividualReturnHandler {
  constructor(private readonly sapTransferReturnPort: ISapTransferReturnPort) {}

  async execute(command: RegisterIndividualReturnCommand): Promise<IndividualReturnResult> {
    const returnEntry = command.entry;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { error: 'Supabase not configured' };

    const serialNumber = String(returnEntry.sn || '').trim();
    if (!serialNumber) {
      return { error: 'El número de serie es obligatorio.' };
    }

    const { data: existing, error: fetchError } = await supabase
      .from('series')
      .select('id, serial_number, current_status, current_reception_id, service_order_id, sap_transfer_id')
      .eq('serial_number', serialNumber)
      .maybeSingle();

    if (fetchError) return { error: fetchError.message };

    if (!existing) {
      return {
        error:
          'Serie no encontrada en el sistema. Una devolución no puede registrar equipos que no existen. Verifique el número de serie o registre el equipo mediante recepción.',
      };
    }

    if (returnEntry.originalGuide && existing.current_reception_id) {
      const { data: reception } = await supabase
        .from('receptions')
        .select('guide_number')
        .eq('id', existing.current_reception_id)
        .maybeSingle();

      const guide = String(returnEntry.originalGuide).trim();
      if (reception?.guide_number && reception.guide_number !== guide) {
        return {
          error: `La guía ingresada (${guide}) no coincide con la recepción del equipo (${reception.guide_number}).`,
        };
      }
    }

    const prevStatus = existing.current_status;

    if (existing.current_status !== 'RECEPCIONADO_BODEGA_GENERAL') {
      return {
        error: `El equipo no está en estado Pendiente de Ingreso a Bodega General (estado actual: ${existing.current_status}).`,
      };
    }

    if (existing.sap_transfer_id) {
      const { count, error: countError } = await this.sapTransferReturnPort.countActiveUnits(
        existing.sap_transfer_id
      );
      if (countError) return { error: countError };

      if (count > 1) {
        const { document } = await this.sapTransferReturnPort.getDocument(existing.sap_transfer_id);
        return {
          error: `Devolución aislada no permitida. Este equipo pertenece al Documento SAP ${document?.sapDocumentNumber || ''} con ${count} equipos. Debe procesar la devolución en bloque por documento SAP.`,
          sapTransferId: existing.sap_transfer_id,
          requiresBlockReturn: true,
        };
      }
    }

    const returnNote = `--- DEVOLUCIÓN ---\nMotivo: ${returnEntry.motivo}\nGuía Salida: ${returnEntry.guiaSalida}\nCat: ${returnEntry.category || 'BODEGA DEVOLUCIÓN'}\nFecha: ${new Date().toLocaleString()}\nUsuario: ${returnEntry.usuario || 'SISTEMA'}`;

    const { error: updateError } = await supabase
      .from('series')
      .update({
        current_status: 'returned',
        notes: returnNote,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id);

    if (updateError) return { error: updateError.message };

    // CHG-007: actualizar OS en devolución individual
    if (existing.service_order_id) {
      const { error: osError } = await supabase
        .from('service_orders')
        .update({ status: 'DEVUELTO' })
        .eq('id', existing.service_order_id);
      if (osError) return { error: osError.message };
    }

    if (existing.sap_transfer_id) {
      const { count: remaining } = await this.sapTransferReturnPort.countActiveUnits(
        existing.sap_transfer_id
      );

      if (remaining === 0) {
        await supabase
          .from('sap_transfer_documents')
          .update({ status: 'DEVUELTO_BLOQUE', updated_at: new Date().toISOString() })
          .eq('id', existing.sap_transfer_id);
      }
    }

    await logAdvancedAudit({
      module: 'Logística',
      tableName: 'series',
      recordId: existing.id,
      action: 'DEVOLUCION_EQUIPO',
      oldValues: {
        current_status: prevStatus,
        current_reception_id: existing.current_reception_id,
        service_order_id: existing.service_order_id,
      },
      newValues: {
        current_status: 'returned',
        current_reception_id: existing.current_reception_id,
        service_order_id: existing.service_order_id,
        motivo: returnEntry.motivo,
        guiaSalida: returnEntry.guiaSalida,
      },
      observations: `Devolución individual registrada. SN: ${serialNumber}`,
    });

    return { success: true };
  }
}
