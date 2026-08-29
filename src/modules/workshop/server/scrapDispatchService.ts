import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';

function chunkIds(ids: string[], size = BATCH_LIMITS.UUID_IN_CLAUSE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export type ScrapDispatchParams = {
  seriesIds: string[];
  brandId: string;
  modelId: string;
  capacity: number;
  /** Referencia opcional (no es el número de caja). */
  reference?: string;
  notes?: string;
  userId: string;
  userRole?: string;
  operatorName?: string;
};

export type ScrapDispatchResult = {
  boxId: string;
  boxCode: string;
  linked: number;
  capacity: number;
};

/**
 * Ingreso a Bodega SCRAPS (mismo patrón que Bodega Central):
 * - Código irrepetible vía `next_scrap_box_code()` (BOX-BAD-001…)
 * - rack_location = SCRAP → aparece en /bodega/scraps
 * - Series siguen irreparable con current_box_id (salen de cola Taller)
 */
export async function createScrapDispatchBox(
  supabase: SupabaseClient,
  params: ScrapDispatchParams
): Promise<ScrapDispatchResult> {
  const {
    seriesIds,
    brandId,
    modelId,
    capacity,
    reference,
    notes,
    userId,
    userRole,
    operatorName,
  } = params;

  const uniqueIds = [...new Set(seriesIds.filter(Boolean))];
  if (uniqueIds.length === 0) {
    throw new Error('Debe escanear al menos una serie para crear la caja SCRAPS.');
  }

  const cap = Math.max(1, Math.floor(capacity) || uniqueIds.length);
  const admin = getSupabaseServerClient();
  const reader = supabase;

  const eligible: string[] = [];
  let receptionId: string | null = null;

  for (const chunk of chunkIds(uniqueIds)) {
    const { data, error } = await reader
      .from('series')
      .select('id, current_status, current_box_id, serial_number, current_reception_id')
      .in('id', chunk);

    if (error) throw new Error(error.message);

    for (const row of data || []) {
      const status = String(row.current_status || '');
      if (status !== 'irreparable') {
        throw new Error(
          `La serie ${row.serial_number || row.id} no está en SCRAP (estado: ${status || '—'}).`
        );
      }
      if (row.current_box_id) {
        throw new Error(
          `La serie ${row.serial_number || row.id} ya está en una caja SCRAPS.`
        );
      }
      if (!receptionId && row.current_reception_id) {
        receptionId = String(row.current_reception_id);
      }
      eligible.push(String(row.id));
    }
  }

  if (eligible.length === 0) {
    throw new Error('Ninguna serie válida para ingreso a Bodega SCRAPS.');
  }

  // Solo cerrar caja completa: validar ANTES de consumir correlativo BOX-BAD.
  if (eligible.length < cap) {
    throw new Error(
      `Caja incompleta: capacidad ${cap} pero solo ${eligible.length} serie(s) válidas. Completa el pistoleo antes de ingresar.`
    );
  }
  if (eligible.length > cap) {
    throw new Error(
      `Hay ${eligible.length} serie(s) para capacidad ${cap}. Ajusta la cantidad de la caja o quita excedentes.`
    );
  }

  // Correlativo SCRAPS independiente (BOX-BAD-001…), no comparte BOX-N de Bodega Central.
  const { data: boxCodeRaw, error: codeError } = await admin.rpc('next_scrap_box_code');
  if (codeError || !boxCodeRaw) {
    throw new Error(codeError?.message || 'No se pudo generar el número de caja SCRAPS (BOX-BAD).');
  }
  const boxCode = String(boxCodeRaw).trim().toUpperCase();

  const insertRow: Record<string, unknown> = {
    box_code: boxCode,
    rack_location: 'SCRAP',
    brand_id: brandId,
    model_id: modelId,
    capacity: cap,
    // Cerrada solo al completar (mismo tamaño que series vinculadas).
    status: 'closed',
    is_partial_box: false,
    assigned_operator_id: userId || null,
  };
  if (receptionId) {
    insertRow.reception_id = receptionId;
  }

  const { data: box, error: boxError } = await admin
    .from('boxes')
    .insert([insertRow])
    .select('id, box_code')
    .single();

  if (boxError || !box) {
    throw new Error(boxError?.message || 'No se pudo crear la caja SCRAPS.');
  }

  const boxId = String(box.id);
  let linked = 0;

  try {
    for (const chunk of chunkIds(eligible)) {
      const { data: updated, error: linkError } = await admin
        .from('series')
        .update({
          current_box_id: boxId,
          current_status: 'irreparable',
        })
        .in('id', chunk)
        .eq('current_status', 'irreparable')
        .is('current_box_id', null)
        .select('id');

      if (linkError) throw new Error(linkError.message);
      linked += updated?.length ?? 0;
    }

    if (linked === 0) {
      throw new Error('Ninguna serie pudo vincularse a la caja SCRAPS.');
    }

    if (linked !== cap) {
      // Evita cajas “vacías/parciales” fantasma: rollback si no se llenó al 100%.
      await admin
        .from('series')
        .update({ current_box_id: null })
        .eq('current_box_id', boxId);
      throw new Error(
        `Ingreso incompleto: se vincularon ${linked}/${cap} series. Reintenta el pistoleo completo.`
      );
    }

    // Alinear metadatos al conteo real vinculado (evita Full/Parcial desfasado).
    await admin
      .from('boxes')
      .update({
        capacity: linked,
        is_partial_box: false,
        status: 'closed',
        assigned_operator_id: userId || null,
      })
      .eq('id', boxId);

    const auditPayload = {
      status: 'irreparable',
      box_id: boxId,
      box_code: boxCode,
      rack_location: 'SCRAP',
      reference: reference || null,
      notes: notes || null,
      operator_name: operatorName,
    };

    const auditRows = eligible.map((recordId) => ({
      user_id: userId,
      user_role: userRole || 'Desconocido',
      module: 'Taller',
      table_name: 'series',
      record_id: recordId,
      action: 'INGRESO BODEGA SCRAPS',
      severity: 'INFO',
      new_values: auditPayload,
      user_agent: 'api/v1/workshop/scrap-dispatch',
    }));

    for (const chunk of chunkIds(auditRows.map((r) => r.record_id))) {
      const rows = auditRows.filter((r) => chunk.includes(r.record_id));
      const { error: auditError } = await admin.from('erp_audit_logs').insert(rows);
      if (auditError) {
        console.warn('[scrap-dispatch] audit:', auditError.message);
      }
    }

    await admin.from('erp_audit_logs').insert({
      user_id: userId,
      user_role: userRole || 'Desconocido',
      module: 'Bodega',
      table_name: 'boxes',
      record_id: boxId,
      action: 'CAJA SCRAPS CREADA',
      severity: 'INFO',
      new_values: {
        box_code: boxCode,
        rack_location: 'SCRAP',
        brand_id: brandId,
        model_id: modelId,
        capacity: linked,
        linked,
        reference: reference || null,
        notes: notes || null,
        operator_name: operatorName,
        assigned_operator_id: userId || null,
      },
      user_agent: 'api/v1/workshop/scrap-dispatch',
    });
  } catch (err) {
    await admin
      .from('series')
      .update({ current_box_id: null })
      .eq('current_box_id', boxId);
    await admin.from('boxes').update({ rack_location: 'ELIMINADO' }).eq('id', boxId);
    throw err;
  }

  return { boxId, boxCode, linked, capacity: linked };
}
