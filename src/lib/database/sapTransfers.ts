import { isCourierLabel } from '@/lib/cacAgencyUtils';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { logAdvancedAudit } from '@/lib/database/audit';

export const SAP_TRANSFER_STATUS = {
  PENDIENTE_INGRESO_BODEGA: 'PENDIENTE_INGRESO_BODEGA',
  INGRESADO_BODEGA: 'INGRESADO_BODEGA',
  DEVUELTO_BLOQUE: 'DEVUELTO_BLOQUE',
} as const;

export type SapTransferDocument = {
  id: string;
  reception_id: string;
  reception_guide_id: string;
  sap_document_number: string;
  agency?: string | null;
  registered_by?: string | null;
  status: string;
};

export type EquipmentUnitPayload = {
  main_serial: string;
  model_id: string;
  brand_id: string;
  all_series: string[];
  material?: string;
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
  return { data: data as SapTransferDocument };
}

export async function classifyEquipmentBatch(params: {
  receptionId: string;
  sapTransferId: string;
  units: EquipmentUnitPayload[];
  registeredBy: string;
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  if (!params.units.length) return { error: 'No hay equipos para clasificar.' };

  const results = [];

  for (const unit of params.units) {
    if (!unit.main_serial) continue;

    const { count } = await supabase
      .from('service_orders')
      .select('*', { count: 'exact', head: true })
      .eq('main_serial', unit.main_serial);

    const reentryCount = (count || 0) + 1;

    const { data: sapTransfer } = await supabase
      .from('sap_transfer_documents')
      .select('reception_guide_id')
      .eq('id', params.sapTransferId)
      .single();

    const { data: osData, error: osError } = await supabase
      .from('service_orders')
      .insert([{
        reception_id: params.receptionId,
        reception_guide_id: sapTransfer?.reception_guide_id || null,
        sap_transfer_id: params.sapTransferId,
        model_id: unit.model_id,
        brand_id: unit.brand_id,
        main_serial: unit.main_serial,
        reentry_count: reentryCount,
        status: 'INGRESADO',
      }])
      .select()
      .single();

    if (osError) {
      console.error('Error creating Service Order:', osError);
      return { error: osError.message };
    }

    const seriesToUpsert = unit.all_series.map((sn) => ({
      serial_number: sn,
      current_reception_id: params.receptionId,
      service_order_id: osData.id,
      sap_transfer_id: params.sapTransferId,
      current_status: 'RECEPCIONADO_BODEGA_GENERAL',
      model_id: unit.model_id,
      brand_id: unit.brand_id,
      ...(unit.material ? { material: unit.material } : {}),
    }));

    const { data: upsertedSeries, error: seriesError } = await supabase
      .from('series')
      .upsert(seriesToUpsert, { onConflict: 'serial_number' })
      .select('id');

    if (seriesError) {
      await supabase.from('service_orders').delete().eq('id', osData.id);
      return { error: seriesError.message };
    }

    if (upsertedSeries) {
      const { logAudit } = await import('@/lib/database/audit');
      for (const s of upsertedSeries) {
        await logAudit('series', s.id, 'RECEPCIÓN CAC', {
          status: 'RECEPCIONADO_BODEGA_GENERAL',
          source: 'cac',
          sap_transfer_id: params.sapTransferId,
          registered_by: params.registeredBy,
        });
      }
    }

    results.push(osData);
  }

  return { data: results };
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
  const doc = (series as any).sap_transfer_documents;
  return Array.isArray(doc) ? doc[0] : doc;
}

export async function processBlockReturnBySapTransfer(
  sapTransferId: string,
  formData: { motivo: string; guiaSalida: string; observaciones?: string },
  currentUserFullName: string
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

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
    (s) => s.current_status !== 'RECEPCIONADO_BODEGA_GENERAL'
  );
  if (invalid.length > 0) {
    return {
      error: `Devolución en bloque: ${invalid.length} equipo(s) no están en estado Pendiente de Ingreso a Bodega General.`,
    };
  }

  const returnNote = `--- DEVOLUCIÓN BLOQUE SAP ---\nSAP: ${sapTransfer.sap_document_number}\nMotivo: ${formData.motivo}\nGuía Salida: ${formData.guiaSalida}\nUsuario: ${currentUserFullName}\nFecha: ${new Date().toLocaleString()}`;

  await Promise.all(
    seriesList.map((s) =>
      supabase
        .from('series')
        .update({
          current_status: 'returned',
          notes: `${returnNote}\n\n${s.notes || ''}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', s.id)
    )
  );

  const osIds = [...new Set(seriesList.map((s) => s.service_order_id).filter(Boolean))];
  if (osIds.length) {
    await supabase.from('service_orders').update({ status: 'DEVUELTO' }).in('id', osIds);
  }

  await supabase
    .from('sap_transfer_documents')
    .update({
      status: SAP_TRANSFER_STATUS.DEVUELTO_BLOQUE,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sapTransferId);

  await logAdvancedAudit({
    module: 'Logística',
    tableName: 'sap_transfer_documents',
    recordId: sapTransferId,
    action: 'DEVOLUCION_BLOQUE_SAP',
    newValues: {
      status: SAP_TRANSFER_STATUS.DEVUELTO_BLOQUE,
      units_count: seriesList.length,
      motivo: formData.motivo,
    },
    observations: `Devolución en bloque por Documento SAP ${sapTransfer.sap_document_number} (${seriesList.length} equipos).`,
  });

  return { success: true, unitsCount: seriesList.length };
}
