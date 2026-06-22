import { isCourierLabel } from '@/lib/cacAgencyUtils';
import { auditSapTransferCreated } from '@/lib/database/cacBackofficeAudit';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { SAP_TRANSFER_STATUS } from '@/modules/sap-transfer';

export {
  SAP_TRANSFER_STATUS,
  BLOCK_RETURN_ELIGIBLE_STATUSES,
  classifyEquipmentBatch,
  processBlockReturnBySapTransfer,
} from '@/modules/sap-transfer';

export type { EquipmentUnitPayload } from '@/modules/sap-transfer';

export type SapTransferDocument = {
  id: string;
  reception_id: string;
  reception_guide_id: string;
  sap_document_number: string;
  agency?: string | null;
  registered_by?: string | null;
  status: string;
};

export async function createOrGetSapTransfer(params: {
  receptionId: string;
  receptionGuideId: string;
  sapDocumentNumber: string;
  agency: string;
  registeredBy: string;
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const sapDoc = params.sapDocumentNumber.trim();
  if (!sapDoc) return { error: 'El número de Documento SAP es obligatorio para equipos.' };

  if (!params.agency?.trim()) {
    return { error: 'Debe indicar la Agencia CAC de ingreso (no confundir con el Courier).' };
  }
  if (isCourierLabel(params.agency)) {
    return { error: 'El valor indicado corresponde al Courier, no a una Agencia CAC.' };
  }

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    'create_or_get_sap_transfer_document',
    {
      p_reception_id: params.receptionId,
      p_reception_guide_id: params.receptionGuideId,
      p_sap_document_number: sapDoc,
      p_agency: params.agency.trim(),
      p_registered_by: params.registeredBy,
    }
  );

  if (!rpcError && rpcData) {
    return { data: rpcData as SapTransferDocument };
  }

  if (rpcError && !/could not find the function|schema cache/i.test(rpcError.message)) {
    return { error: rpcError.message };
  }

  const { data: existing, error: fetchError } = await supabase
    .from('sap_transfer_documents')
    .select('*')
    .eq('reception_guide_id', params.receptionGuideId)
    .eq('sap_document_number', sapDoc)
    .maybeSingle();

  if (fetchError) return { error: fetchError.message };

  if (existing) {
    const shouldFillAgency =
      params.agency?.trim() &&
      !isCourierLabel(params.agency) &&
      !existing.agency?.trim();

    if (shouldFillAgency) {
      const { data: updated, error: updateError } = await supabase
        .from('sap_transfer_documents')
        .update({ agency: params.agency.trim() })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) return { error: updateError.message };
      return { data: updated as SapTransferDocument };
    }

    return { data: existing as SapTransferDocument };
  }

  const { data, error } = await supabase
    .from('sap_transfer_documents')
    .insert([{
      reception_id: params.receptionId,
      reception_guide_id: params.receptionGuideId,
      sap_document_number: sapDoc,
      agency: params.agency,
      registered_by: params.registeredBy,
      status: SAP_TRANSFER_STATUS.PENDIENTE_INGRESO_BODEGA,
    }])
    .select()
    .single();

  if (error) return { error: error.message };

  await auditSapTransferCreated({
    sapTransferId: data.id,
    receptionId: params.receptionId,
    sapDocumentNumber: sapDoc,
    agency: params.agency,
    registeredBy: params.registeredBy,
  });

  return { data: data as SapTransferDocument };
}

export async function getSapTransferBySeriesId(seriesId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data: series } = await supabase
    .from('series')
    .select('sap_transfer_id, sap_transfer_documents(id, sap_document_number, status)')
    .eq('id', seriesId)
    .maybeSingle();

  if (!series?.sap_transfer_id) return null;
  const doc = (series as { sap_transfer_documents?: unknown }).sap_transfer_documents;
  return Array.isArray(doc) ? doc[0] : doc;
}
