import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { processBlockReturnBySapTransfer } from '@/modules/sap-transfer/factory';
import type { ISapTransferReturnPort } from '@/modules/returns/domain/ports/sap-transfer-return.port';
import type { BlockReturnRequest } from '@/modules/returns/domain/ports/sap-transfer-return.port';

const ELIGIBLE_STATUS = 'RECEPCIONADO_BODEGA_GENERAL';

export class SapTransferReturnPortAdapter implements ISapTransferReturnPort {
  async countActiveUnits(sapTransferId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { count: 0, error: 'Supabase not configured' };

    const { data, error } = await supabase
      .from('series')
      .select('service_order_id')
      .eq('sap_transfer_id', sapTransferId)
      .eq('current_status', ELIGIBLE_STATUS);

    if (error) return { count: 0, error: error.message };

    const count = new Set((data || []).map((s) => s.service_order_id).filter(Boolean)).size;
    return { count };
  }

  async getDocument(sapTransferId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { document: null, error: 'Supabase not configured' };

    const { data, error } = await supabase
      .from('sap_transfer_documents')
      .select('id, sap_document_number, status')
      .eq('id', sapTransferId)
      .maybeSingle();

    if (error) return { document: null, error: error.message };
    if (!data) return { document: null };

    return {
      document: {
        id: data.id,
        sapDocumentNumber: data.sap_document_number,
        status: data.status,
      },
    };
  }

  async executeBlockReturn(request: BlockReturnRequest) {
    return processBlockReturnBySapTransfer(
      request.sapTransferId,
      request.formData,
      request.currentUserFullName
    );
  }
}
