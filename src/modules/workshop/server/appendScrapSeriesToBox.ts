import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { BATCH_LIMITS } from '@/shared/constants/batchLimits';
import { isScrapStagingRack } from '@/lib/database/warehouse';
import {
  buildEquipmentSerialSlots,
  type SerialPickRow,
} from '@/lib/sap/equipmentSerialSlots';

function chunkIds(ids: string[], size = BATCH_LIMITS.UUID_IN_CLAUSE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

export type AppendScrapSeriesParams = {
  boxId: string;
  /** UUID de la serie pistoleada (o cualquier hermana de la OS). */
  seriesId?: string;
  /** Alternativa: SN pistoleado (se resuelve a UUID en servidor). */
  serialNumber?: string;
  userId: string;
  userRole?: string;
  operatorName?: string;
};

export type AppendScrapSeriesResult = {
  boxId: string;
  boxCode: string;
  linked: number;
  /** Equipos (OS distintas) en la caja tras el append. */
  equiposCount: number;
  capacity: number;
  closed: boolean;
  slots: { s1: string; s2: string; s3: string; s4: string };
  osLabel: string | null;
};

/**
 * Completa una caja SCRAPS parcial: vincula la serie (irreparable, sin caja)
 * y cierra al alcanzar capacidad (conteo por OS / equipo).
 */
export async function appendScrapSeriesToBox(
  _supabase: SupabaseClient,
  params: AppendScrapSeriesParams
): Promise<AppendScrapSeriesResult> {
  const { boxId, seriesId: seriesIdParam, serialNumber, userId, userRole, operatorName } =
    params;
  const admin = getSupabaseServerClient();

  let seriesId = seriesIdParam ? String(seriesIdParam) : '';
  if (!seriesId && serialNumber) {
    const sn = String(serialNumber).trim().toUpperCase();
    const { data: bySn, error: snErr } = await admin
      .from('series')
      .select('id')
      .eq('serial_number', sn)
      .maybeSingle();
    if (snErr || !bySn) {
      throw new Error(snErr?.message || `Serie "${sn}" no encontrada.`);
    }
    seriesId = String(bySn.id);
  }
  if (!seriesId) {
    throw new Error('Debe indicar series_id o serial_number.');
  }

  const { data: box, error: boxErr } = await admin
    .from('boxes')
    .select('id, box_code, rack_location, capacity, status, brand_id, model_id')
    .eq('id', boxId)
    .maybeSingle();

  if (boxErr || !box) {
    throw new Error(boxErr?.message || 'Caja SCRAPS no encontrada.');
  }
  if (!isScrapStagingRack(box.rack_location as string | null)) {
    throw new Error('La caja no está en Bodega SCRAPS.');
  }

  const capacity = Math.max(1, Number(box.capacity) || 1);

  const { data: existingSeries, error: exErr } = await admin
    .from('series')
    .select('id, service_order_id, serial_number')
    .eq('current_box_id', boxId);

  if (exErr) throw new Error(exErr.message);

  const existingOs = new Set(
    (existingSeries || []).map((s) => String(s.service_order_id || s.id))
  );
  const existingIds = new Set((existingSeries || []).map((s) => String(s.id)));

  if (existingOs.size >= capacity) {
    throw new Error(
      `La caja ya está completa (${existingOs.size}/${capacity}). No se pueden agregar más equipos.`
    );
  }

  const { data: scanned, error: scErr } = await admin
    .from('series')
    .select(
      'id, serial_number, current_status, current_box_id, service_order_id, material, valuation, created_at, s2, s3, s4, brand_id, model_id'
    )
    .eq('id', seriesId)
    .maybeSingle();

  if (scErr || !scanned) {
    throw new Error(scErr?.message || 'Serie no encontrada.');
  }

  if (String(scanned.current_status || '') !== 'irreparable') {
    throw new Error(
      `La serie ${scanned.serial_number || seriesId} no está en SCRAP (estado: ${scanned.current_status || '—'}).`
    );
  }
  if (scanned.current_box_id) {
    if (String(scanned.current_box_id) === boxId) {
      throw new Error(`La serie ${scanned.serial_number} ya está en esta caja.`);
    }
    throw new Error(`La serie ${scanned.serial_number} ya está en otra caja.`);
  }

  const osId = scanned.service_order_id ? String(scanned.service_order_id) : null;
  if (osId && existingOs.has(osId)) {
    throw new Error('Ese equipo (OS) ya está registrado en esta caja SCRAPS.');
  }

  // Hermanas de la OS para S1–S4 (S1 = SAP primary).
  let siblings: SerialPickRow[] = [
    {
      id: String(scanned.id),
      serial_number: scanned.serial_number,
      material: scanned.material,
      valuation: scanned.valuation,
      created_at: scanned.created_at,
      s2: scanned.s2,
      s3: scanned.s3,
      s4: scanned.s4,
    },
  ];
  let mainSerial: string | null = null;
  let osLabel: string | null = null;

  if (osId) {
    const [{ data: sibRows }, { data: osRow }] = await Promise.all([
      admin
        .from('series')
        .select('id, serial_number, material, valuation, created_at, s2, s3, s4, current_status, current_box_id')
        .eq('service_order_id', osId)
        .order('created_at', { ascending: true }),
      admin.from('service_orders').select('id, os_label, main_serial').eq('id', osId).maybeSingle(),
    ]);
    mainSerial = osRow?.main_serial ? String(osRow.main_serial) : null;
    osLabel = osRow?.os_label ? String(osRow.os_label) : null;
    if (sibRows?.length) {
      siblings = sibRows.map((r) => ({
        id: String(r.id),
        serial_number: r.serial_number,
        material: r.material,
        valuation: r.valuation,
        created_at: r.created_at,
        s2: r.s2,
        s3: r.s3,
        s4: r.s4,
      }));
    }
  }

  const slots = buildEquipmentSerialSlots(siblings, mainSerial);

  // Unicidad exacta de seriales dentro de la caja (S1–S4 y filas ya vinculadas).
  const occupiedSerials = new Set(
    (existingSeries || [])
      .map((s) => String(s.serial_number || '').trim().toUpperCase())
      .filter(Boolean)
  );
  const incomingSerials = [
    slots.s1,
    slots.s2,
    slots.s3,
    slots.s4,
    ...siblings.map((s) => String(s.serial_number || '')),
  ]
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  for (const sn of incomingSerials) {
    if (occupiedSerials.has(sn)) {
      throw new Error(
        `Serial duplicado en esta caja: "${sn}". Cada serie debe ser única por caja.`
      );
    }
  }
  const incomingUnique = new Set(incomingSerials);
  if (incomingUnique.size !== incomingSerials.length) {
    throw new Error(
      'El equipo trae seriales duplicados entre S1–S4. Verifique el inventario del equipo.'
    );
  }

  // Vincular solo series elegibles (irreparable, sin caja) de la OS — evita inflar con series ya en otra caja.
  const toLink: string[] = [];
  if (osId) {
    const { data: linkCandidates } = await admin
      .from('series')
      .select('id, current_status, current_box_id, serial_number')
      .eq('service_order_id', osId);
    for (const row of linkCandidates || []) {
      if (existingIds.has(String(row.id))) continue;
      if (String(row.current_status || '') !== 'irreparable') continue;
      if (row.current_box_id) continue;
      toLink.push(String(row.id));
    }
  } else {
    toLink.push(String(scanned.id));
  }

  if (toLink.length === 0) {
    throw new Error('No hay series elegibles de este equipo para vincular a la caja.');
  }

  let linked = 0;
  for (const chunk of chunkIds(toLink)) {
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
    throw new Error('No se pudo vincular la serie a la caja SCRAPS.');
  }

  const { data: afterSeries } = await admin
    .from('series')
    .select('id, service_order_id')
    .eq('current_box_id', boxId);

  const equiposCount = new Set(
    (afterSeries || []).map((s) => String(s.service_order_id || s.id))
  ).size;

  const readyToClose = equiposCount >= capacity;
  await admin
    .from('boxes')
    .update({
      is_partial_box: !readyToClose,
      // No cerrar aquí: el operador confirma con "Guardar / Cerrar caja".
      status: 'open',
      assigned_operator_id: userId || null,
    })
    .eq('id', boxId);

  await admin.from('erp_audit_logs').insert({
    user_id: userId,
    user_role: userRole || 'Desconocido',
    module: 'Bodega',
    table_name: 'boxes',
    record_id: boxId,
    action: readyToClose ? 'SCRAPS LISTA PARA CERRAR' : 'APPEND SCRAPS SERIE',
    severity: 'INFO',
    new_values: {
      box_code: box.box_code,
      series_id: seriesId,
      linked,
      equipos_count: equiposCount,
      capacity,
      ready_to_close: readyToClose,
      s1: slots.s1,
      s2: slots.s2,
      s3: slots.s3,
      s4: slots.s4,
      operator_name: operatorName,
    },
    user_agent: 'api/v1/workshop/scrap-dispatch/append',
  });

  return {
    boxId: String(box.id),
    boxCode: String(box.box_code),
    linked,
    equiposCount,
    capacity,
    closed: readyToClose,
    slots: { s1: slots.s1, s2: slots.s2, s3: slots.s3, s4: slots.s4 },
    osLabel,
  };
}
