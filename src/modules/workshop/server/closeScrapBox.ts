import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isScrapStagingRack } from '@/lib/database/warehouse';

export type CloseScrapBoxParams = {
  boxId: string;
  /**
   * Si true: fija capacity = equipos actuales y cierra.
   * Usar cuando el operador ya pistoleó todo pero la capacidad declarada quedó más alta.
   */
  resizeCapacityToContents?: boolean;
  userId: string;
  userRole?: string;
  operatorName?: string;
};

export type CloseScrapBoxResult = {
  boxId: string;
  boxCode: string;
  equiposCount: number;
  capacity: number;
  resized: boolean;
};

/**
 * Cierra una caja SCRAPS (Full).
 * - Sin resize: exige equipos >= capacity.
 * - Con resize: capacity pasa a ser el conteo real de equipos (OS).
 */
export async function closeScrapBox(
  _supabase: SupabaseClient,
  params: CloseScrapBoxParams
): Promise<CloseScrapBoxResult> {
  const { boxId, resizeCapacityToContents = false, userId, userRole, operatorName } = params;
  const admin = getSupabaseServerClient();

  const { data: box, error: boxErr } = await admin
    .from('boxes')
    .select('id, box_code, rack_location, capacity, status')
    .eq('id', boxId)
    .maybeSingle();

  if (boxErr || !box) {
    throw new Error(boxErr?.message || 'Caja SCRAPS no encontrada.');
  }
  if (!isScrapStagingRack(box.rack_location as string | null)) {
    throw new Error('La caja no está en Bodega SCRAPS.');
  }

  const { data: seriesRows, error: sErr } = await admin
    .from('series')
    .select('id, service_order_id')
    .eq('current_box_id', boxId);

  if (sErr) throw new Error(sErr.message);

  const equiposCount = new Set(
    (seriesRows || []).map((s) => String(s.service_order_id || s.id))
  ).size;

  if (equiposCount <= 0) {
    throw new Error('No se puede cerrar una caja vacía. Pistolee al menos un equipo.');
  }

  const declaredCapacity = Math.max(1, Number(box.capacity) || 1);
  let finalCapacity = declaredCapacity;
  let resized = false;

  if (resizeCapacityToContents) {
    finalCapacity = equiposCount;
    resized = finalCapacity !== declaredCapacity;
  } else if (equiposCount < declaredCapacity) {
    throw new Error(
      `Caja incompleta: ${equiposCount}/${declaredCapacity} equipos. ` +
        `Siga pistoleando o use "Cerrar con ${equiposCount} equipos" para ajustar la capacidad.`
    );
  }

  const { error: updErr } = await admin
    .from('boxes')
    .update({
      capacity: finalCapacity,
      is_partial_box: false,
      status: 'closed',
      assigned_operator_id: userId || null,
    })
    .eq('id', boxId);

  if (updErr) throw new Error(updErr.message);

  await admin.from('erp_audit_logs').insert({
    user_id: userId,
    user_role: userRole || 'Desconocido',
    module: 'Bodega',
    table_name: 'boxes',
    record_id: boxId,
    action: resized ? 'CAJA SCRAPS CERRADA (CAP. AJUSTADA)' : 'CAJA SCRAPS CERRADA',
    severity: 'INFO',
    new_values: {
      box_code: box.box_code,
      equipos_count: equiposCount,
      capacity_before: declaredCapacity,
      capacity_after: finalCapacity,
      resized,
      operator_name: operatorName,
    },
    user_agent: 'api/v1/workshop/scrap-dispatch/close',
  });

  return {
    boxId: String(box.id),
    boxCode: String(box.box_code),
    equiposCount,
    capacity: finalCapacity,
    resized,
  };
}
