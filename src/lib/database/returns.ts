import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { logAdvancedAudit } from '@/lib/database/audit';
import { processBlockReturnBySapTransfer } from '@/lib/database/sapTransfers';

export { processBlockReturnBySapTransfer };

export async function getReturns() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  // In our schema, returns can be tracked in series with status 'returned'
  // Or we can have a specific returns table if needed.
  // For now, let's assume we use 'series' with a 'returned' status for simplicity
  // or a specific table if the user wants more detail.
  
  const { data, error } = await supabase
    .from('series')
    .select(`
      id,
      serial_number,
      current_status,
      updated_at,
      current_reception_id,
      receptions (guide_number, carrier),
      service_orders (os_label)
    `)
    .eq('current_status', 'returned');

  if (error) return [];
  return data;
}

export async function registerNewReturn(returnEntry: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

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
      error: 'Serie no encontrada en el sistema. Una devolución no puede registrar equipos que no existen. Verifique el número de serie o registre el equipo mediante recepción.'
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
        error: `La guía ingresada (${guide}) no coincide con la recepción del equipo (${reception.guide_number}).`
      };
    }
  }

  const prevStatus = existing.current_status;

  const { error: updateError } = await supabase
    .from('series')
    .update({
      current_status: 'returned',
      updated_at: new Date().toISOString()
    })
    .eq('id', existing.id);

  if (updateError) return { error: updateError.message };

  // Devolución en bloque obligatoria si el equipo pertenece a un Traslado SAP con más de una unidad
  if (existing.sap_transfer_id) {
    const { count } = await supabase
      .from('series')
      .select('*', { count: 'exact', head: true })
      .eq('sap_transfer_id', existing.sap_transfer_id)
      .eq('current_status', 'RECEPCIONADO_BODEGA_GENERAL');

    if ((count || 0) > 1) {
      const { data: sapDoc } = await supabase
        .from('sap_transfer_documents')
        .select('sap_document_number')
        .eq('id', existing.sap_transfer_id)
        .maybeSingle();

      return {
        error: `Devolución aislada no permitida. Este equipo pertenece al Documento SAP ${sapDoc?.sap_document_number || ''} con ${count} unidades. Debe procesar la devolución en bloque por documento SAP.`,
        sapTransferId: existing.sap_transfer_id,
        requiresBlockReturn: true,
      };
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
      service_order_id: existing.service_order_id
    },
    newValues: {
      current_status: 'returned',
      current_reception_id: existing.current_reception_id,
      service_order_id: existing.service_order_id,
      motivo: returnEntry.motivo,
      guiaSalida: returnEntry.guiaSalida
    },
    observations: `Devolución individual registrada. SN: ${serialNumber}`
  });

  return { success: true };
}

export async function processFullReceptionReturn(
  receptionId: string, 
  formData: { motivo: string, guiaSalida: string, observaciones: string },
  currentUserFullName: string
) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  try {
    // 1. Get the reception details
    const { data: reception, error: recError } = await supabase
      .from('receptions')
      .select('*')
      .eq('id', receptionId)
      .single();
      
    if (recError || !reception) return { error: 'Recepción no encontrada' };

    // 2. Get all series for this reception
    const { data: seriesList, error: seriesError } = await supabase
      .from('series')
      .select('id, serial_number, current_status, notes')
      .eq('current_reception_id', receptionId);
      
    if (seriesError) return { error: 'Error obteniendo equipos (series)' };

    if (!seriesList || seriesList.length === 0) {
      return { error: 'No se encontraron equipos registrados para esta recepción. Solo se pueden devolver recepciones con equipos clasificados.' };
    }

    const seriesIds = seriesList.map(s => s.id);

    // 3. Prepare notes
    const newNotes = `--- DEVOLUCIÓN ---\nMotivo: ${formData.motivo}\nGuía de Salida: ${formData.guiaSalida}\nFecha: ${new Date().toLocaleString()}\nUsuario: ${currentUserFullName}\nObservaciones: ${formData.observaciones || 'N/A'}`;

    // 4. Update all series to 'returned' and prepend notes so it shows up in Devoluciones grid
    const updateSeriesPromises = seriesList.map(s => {
      const newSeriesNotes = `--- DEVOLUCIÓN ---\nMotivo: ${formData.motivo}\nGuía Salida: ${formData.guiaSalida}\nCat: BODEGA DEVOLUCIÓN\n\n${s.notes || ''}`;
      return supabase.from('series').update({
        current_status: 'returned',
        notes: newSeriesNotes,
        updated_at: new Date().toISOString()
      }).eq('id', s.id);
    });

    await Promise.all(updateSeriesPromises);

    // 5. Update Reception
    const recNotes = (reception.notes || '') + `\n\n${newNotes}`;
    const { error: updateRecError } = await supabase
      .from('receptions')
      .update({
        status: 'DEVUELTO',
        notes: recNotes
      })
      .eq('id', receptionId);

    if (updateRecError) return { error: `Error actualizando estado del lote: ${updateRecError.message}` };

    // 6. Log Audit for each series
    const auditPromises = seriesList.map(s => logAdvancedAudit({
      module: 'Logística',
      tableName: 'series',
      recordId: s.id,
      action: 'DEVOLUCION_EQUIPO',
      newValues: { status: 'returned', motivo: formData.motivo, guiaSalida: formData.guiaSalida },
      observations: `Equipo devuelto forzosamente junto con su lote. Motivo: ${formData.motivo}`
    }));

    await Promise.allSettled(auditPromises);

    // 7. Log Audit for Reception
    await logAdvancedAudit({
      module: 'Logística',
      tableName: 'receptions',
      recordId: receptionId,
      action: 'DEVOLUCION_LOTE',
      newValues: { status: 'DEVUELTO' },
      observations: `Lote devuelto completo (todos sus equipos). Motivo: ${formData.motivo}`
    });

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function undoFullReceptionReturn(receptionId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  try {
    // 1. Get the reception
    const { data: reception, error: recError } = await supabase
      .from('receptions')
      .select('*')
      .eq('id', receptionId)
      .single();
      
    if (recError || !reception) return { error: 'Recepción no encontrada' };

    // 2. Get all series in 'returned' state for this reception
    const { data: seriesList, error: seriesError } = await supabase
      .from('series')
      .select('id, current_status, notes')
      .eq('current_reception_id', receptionId)
      .eq('current_status', 'returned');

    if (seriesError) return { error: 'Error obteniendo equipos devueltos' };

    // 3. Revert each series
    const updateSeriesPromises = seriesList.map(s => {
      let prevStatus = 'CLASIFICADA'; // Fallback
      let newNotes = s.notes || '';
      
      if (newNotes.includes('PrevStatus: ')) {
        const match = newNotes.match(/PrevStatus:\s*([^\n]+)/);
        if (match && match[1]) {
          prevStatus = match[1].trim();
        }
      }

      // Remove the Devolución block
      newNotes = newNotes.replace(/--- DEVOLUCIÓN ---[\s\S]*?Cat: BODEGA DEVOLUCIÓN\s*(PrevStatus:[^\n]+\n+)?/, '');

      return supabase.from('series').update({
        current_status: prevStatus,
        notes: newNotes.trim(),
        updated_at: new Date().toISOString()
      }).eq('id', s.id);
    });

    await Promise.all(updateSeriesPromises);

    // 4. Update Reception status
    const { error: updateRecError } = await supabase
      .from('receptions')
      .update({
        status: 'PENDIENTE_BACKOFFICE',
        notes: reception.notes ? reception.notes.replace(/--- DEVOLUCIÓN ---[\s\S]*?Observaciones:[^\n]+/, '').trim() : ''
      })
      .eq('id', receptionId);

    if (updateRecError) return { error: `Error actualizando lote: ${updateRecError.message}` };

    // 5. Log Audits
    const auditPromises = seriesList.map(s => logAdvancedAudit({
      module: 'Logística',
      tableName: 'series',
      recordId: s.id,
      action: 'REVERSO_DEVOLUCION_EQUIPO',
      newValues: { status: 'reverted' },
      observations: `Reverso de devolución masiva. Regresado a estado anterior.`
    }));
    await Promise.allSettled(auditPromises);

    await logAdvancedAudit({
      module: 'Logística',
      tableName: 'receptions',
      recordId: receptionId,
      action: 'REVERSO_DEVOLUCION_LOTE',
      newValues: { status: 'PENDIENTE_BACKOFFICE' },
      observations: `Reverso de devolución de lote completo.`
    });

    return { success: true };
  } catch (err: any) {
    return { error: err.message };
  }
}
