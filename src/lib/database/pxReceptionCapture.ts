import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  DOMAIN_EVENT_SOURCE,
  emitDomainEventServer,
  mapPxAuditActionToDomainEvent,
} from '@/lib/database/domainEvents';
import {
  extractDocRefFromPxNotes,
  formatPxReceptionError,
  isDuplicatePxGuideError,
} from '@/lib/database/receptions';
import type { GuideData } from '@/app/(erp)/recepcion/types/reception.types';

const PX_REC_MIN = 800000;
const PX_IN_PROGRESS = 'EN_PROCESO';

export type PxLotInput = {
  technologyName?: string;
  brandId?: string | null;
  modelId?: string | null;
  brandName?: string;
  modelName?: string;
  expectedUnits: number;
  material?: string;
};

export type PxStartInput = {
  guideData: GuideData;
  operatorName: string;
  operatorId?: string | null;
  preferredGuideNumber?: string;
};

export type PxEquipmentRow = {
  id: string;
  main_serial: string;
  serial_s2: string | null;
  serial_s3: string | null;
  serial_s4: string | null;
  material: string | null;
  captured_at: string;
};

export type PxBoxSnapshot = {
  id: string;
  box_code: string;
  status: string;
  declared_quantity: number;
  declared_quantity_original?: number | null;
  captured_count: number;
  brand_id: string | null;
  model_id: string | null;
  version: number;
  locked_by?: string | null;
  lock_expires_at?: string | null;
  assigned_operator_id?: string | null;
  is_partial_box?: boolean;
  partial_box_reason?: string | null;
  quantity_adjustment_reason?: string | null;
  lots: Array<{
    id: string;
    technology_name: string | null;
    brand_name: string | null;
    model_name: string | null;
    expected_units: number;
    brand_id: string | null;
    model_id: string | null;
  }>;
  equipment: PxEquipmentRow[];
};

export type PxReceptionSnapshot = {
  reception: {
    id: string;
    guide_number: string;
    status: string;
    sap_document: string | null;
    carrier: string | null;
    notes: string | null;
    expected_units: number | null;
    expected_units_sap: number | null;
    received_units: number | null;
    variance_units: number | null;
    variance_reason: string | null;
    version: number;
    created_at: string;
  };
  boxes: PxBoxSnapshot[];
  total_captured: number;
};

function buildPxNotes(guideData: GuideData, operatorName: string, boxCount: number): string {
  return [
    `DOC Ref: ${guideData.docReferencia || '---'}`,
    `Agencia: ${guideData.agencia || guideData.proveedorPx}`,
    `Proveedor PX: ${guideData.proveedorPx}`,
    `Piloto: ${guideData.piloto || '---'}`,
    `Courier: ${guideData.courier || '---'}`,
    `Backoffice_Tech: `,
    `Cajas: ${boxCount}`,
    `Recibido Por: ${operatorName}`,
  ].join('\n');
}

async function generateNextPxGuideNumberServer(): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('receptions')
    .select('guide_number')
    .eq('source', 'px')
    .ilike('guide_number', 'REC-%');

  if (error) {
    console.error('generateNextPxGuideNumberServer:', error);
    return `REC-${PX_REC_MIN}`;
  }

  let maxNum = 0;
  let foundRec = false;
  for (const row of data || []) {
    const match = String(row.guide_number || '').match(/^REC-(\d+)$/i);
    if (!match) continue;
    foundRec = true;
    const num = parseInt(match[1], 10);
    if (!Number.isNaN(num) && num > maxNum) maxNum = num;
  }

  return foundRec ? `REC-${maxNum + 1}` : `REC-${PX_REC_MIN}`;
}

async function isPxGuideNumberAvailableServer(guideNumber: string): Promise<boolean> {
  const supabase = getSupabaseServerClient();
  const { count, error } = await supabase
    .from('receptions')
    .select('id', { count: 'exact', head: true })
    .eq('source', 'px')
    .eq('guide_number', guideNumber.trim());

  if (error) return false;
  return (count || 0) === 0;
}

async function resolveUniquePxGuideNumberServer(preferred?: string): Promise<string> {
  const pref = preferred?.trim();
  if (pref && (await isPxGuideNumberAvailableServer(pref))) return pref;

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = await generateNextPxGuideNumberServer();
    if (await isPxGuideNumberAvailableServer(candidate)) return candidate;
  }

  return `REC-${Date.now()}`;
}

async function validatePxHeaderForStart(guideData: GuideData): Promise<{ ok: true } | { ok: false; message: string }> {
  const supabase = getSupabaseServerClient();
  const sap = guideData.sap?.trim();
  const doc = guideData.docReferencia?.trim();

  if (sap && sap !== 'SIN-PEDIDO') {
    const { data } = await supabase
      .from('receptions')
      .select('id, guide_number, created_at, status')
      .eq('source', 'px')
      .eq('sap_document', sap)
      .in('status', ['CLASIFICADA', 'RECEPCIONADA', 'PENDIENTE_BACKOFFICE', PX_IN_PROGRESS])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const when = data.created_at ? new Date(data.created_at).toLocaleString('es-GT') : '';
      return {
        ok: false,
        message: `El pedido ${sap} ya está registrado en ${data.guide_number} (${when}).`,
      };
    }
  }

  if (doc) {
    const { data: rows } = await supabase
      .from('receptions')
      .select('id, guide_number, sap_document, created_at, notes, status')
      .eq('source', 'px')
      .in('status', ['CLASIFICADA', 'RECEPCIONADA', 'PENDIENTE_BACKOFFICE', PX_IN_PROGRESS])
      .ilike('notes', '%DOC Ref:%');

    const docLower = doc.toLowerCase();
    for (const row of rows || []) {
      const existing = extractDocRefFromPxNotes(row.notes);
      if (existing && existing.toLowerCase() === docLower) {
        const when = row.created_at ? new Date(row.created_at).toLocaleString('es-GT') : '';
        return {
          ok: false,
          message: `DOC Referencia "${doc}" ya registrado en ${row.guide_number} (${when}).`,
        };
      }
    }
  }

  return { ok: true };
}

export async function emitPxCaptureMetric(payload: {
  receptionId?: string;
  boxId?: string;
  action: string;
  outcome: 'success' | 'error';
  durationMs?: number;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const supabase = getSupabaseServerClient();
    await supabase.from('px_capture_metrics').insert({
      reception_id: payload.receptionId ?? null,
      box_id: payload.boxId ?? null,
      action: payload.action,
      outcome: payload.outcome,
      duration_ms: payload.durationMs ?? null,
      error_code: payload.errorCode ?? null,
      metadata: payload.metadata ?? {},
    });
  } catch (e) {
    console.error('emitPxCaptureMetric:', e);
  }
}

export async function emitPxDomainEvent(
  action: string,
  receptionId: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    const supabase = getSupabaseServerClient();

    const { data: auditRow, error: auditError } = await supabase
      .from('erp_audit_logs')
      .insert({
        module: 'px_reception',
        action,
        table_name: 'receptions',
        record_id: receptionId,
        new_values: metadata,
        severity: 'INFO',
      })
      .select('id')
      .single();

    if (auditError) {
      console.error('emitPxDomainEvent audit:', auditError.message);
      return;
    }

    const mapped = mapPxAuditActionToDomainEvent(action, receptionId, metadata);
    if (!mapped) return;

    await emitDomainEventServer({
      eventType: mapped.eventType,
      aggregateType: mapped.aggregateType,
      aggregateId: mapped.aggregateId,
      correlationId: mapped.correlationId,
      source: DOMAIN_EVENT_SOURCE.PX_RECEPTION,
      actorLabel: mapped.actorLabel,
      auditLogId: auditRow.id,
      payload: {
        audit_action: action,
        ...metadata,
      },
    });
  } catch (e) {
    console.error('emitPxDomainEvent:', e);
  }
}

export async function joinOrStartPxReception(input: PxStartInput): Promise<
  | { success: true; receptionId: string; guideNumber: string; joined: boolean }
  | { success: false; error: string }
> {
  const started = Date.now();
  const supabase = getSupabaseServerClient();
  const sap = input.guideData.sap?.trim();
  if (!sap) {
    return { success: false, error: 'Documento SAP obligatorio.' };
  }

  const { data, error } = await supabase.rpc('join_or_start_px_reception_tx', {
    p_sap_document: sap,
    p_carrier: input.guideData.proveedorPx || 'N/A',
    p_notes: buildPxNotes(input.guideData, input.operatorName, input.guideData.totalCajasEsperadas || 0),
    p_expected_units_sap: input.guideData.totalCajasEsperadas || null,
    p_preferred_guide: input.preferredGuideNumber || input.guideData.guia || null,
    p_operator_id: input.operatorId || null,
    p_operator_name: input.operatorName,
  });

  if (error) {
    await emitPxCaptureMetric({
      action: 'join_or_start_px_reception',
      outcome: 'error',
      errorCode: 'RPC_ERROR',
      durationMs: Date.now() - started,
      metadata: { message: error.message },
    });
    return { success: false, error: error.message };
  }

  const payload = data as {
    reception_id: string;
    guide_number: string;
    joined: boolean;
  };

  await emitPxDomainEvent(payload.joined ? 'OperatorJoinedReception' : 'ReceptionStarted', payload.reception_id, {
    guide_number: payload.guide_number,
    sap_document: sap,
    joined: payload.joined,
  });
  await emitPxCaptureMetric({
    receptionId: payload.reception_id,
    action: 'join_or_start_px_reception',
    outcome: 'success',
    durationMs: Date.now() - started,
  });

  return {
    success: true,
    receptionId: payload.reception_id,
    guideNumber: payload.guide_number,
    joined: payload.joined,
  };
}

/** @deprecated Use joinOrStartPxReception — mantiene compatibilidad temporal */
export async function startPxReception(input: PxStartInput): Promise<
  { success: true; receptionId: string; guideNumber: string } | { success: false; error: string }
> {
  const result = await joinOrStartPxReception(input);
  if (!result.success) return result;
  return { success: true, receptionId: result.receptionId, guideNumber: result.guideNumber };
}

export async function listPxInProgressReceptions(): Promise<
  Array<{ id: string; guide_number: string; sap_document: string | null; created_at: string; captured_count: number }>
> {
  const supabase = getSupabaseServerClient();
  const { data: receptions, error } = await supabase
    .from('receptions')
    .select('id, guide_number, sap_document, created_at')
    .eq('source', 'px')
    .eq('status', PX_IN_PROGRESS)
    .order('created_at', { ascending: false });

  if (error || !receptions?.length) return [];

  const ids = receptions.map((r) => r.id);
  const { data: counts } = await supabase
    .from('px_reception_equipment')
    .select('reception_id')
    .in('reception_id', ids)
    .eq('capture_status', 'active');

  const countByRec = new Map<string, number>();
  for (const row of counts || []) {
    countByRec.set(row.reception_id, (countByRec.get(row.reception_id) || 0) + 1);
  }

  return receptions.map((r) => ({
    ...r,
    captured_count: countByRec.get(r.id) || 0,
  }));
}

export async function createPxCaptureBox(
  receptionId: string,
  boxCode: string,
  lots: PxLotInput[]
): Promise<{ success: true; box: PxBoxSnapshot } | { success: false; error: string }> {
  const supabase = getSupabaseServerClient();
  const { data: rec } = await supabase
    .from('receptions')
    .select('id, status, expected_units_sap')
    .eq('id', receptionId)
    .maybeSingle();

  if (!rec || rec.status !== PX_IN_PROGRESS) {
    return { success: false, error: 'Recepción no encontrada o no está EN_PROCESO.' };
  }

  const { count: existingBoxCount } = await supabase
    .from('boxes')
    .select('id', { count: 'exact', head: true })
    .eq('reception_id', receptionId)
    .neq('rack_location', 'ELIMINADO');

  const maxBoxes = rec.expected_units_sap ?? 0;
  if (maxBoxes > 0 && (existingBoxCount || 0) >= maxBoxes) {
    return {
      success: false,
      error: `Límite de ${maxBoxes} caja(s) alcanzado. Edite "Cantidad Total Cajas" en la cabecera si necesita agregar más.`,
    };
  }

  const declaredQuantity = lots.reduce((acc, l) => acc + (l.expectedUnits || 0), 0);
  if (declaredQuantity <= 0) {
    return { success: false, error: 'La caja debe tener al menos un lote con cantidad esperada.' };
  }

  const firstLot = lots[0];
  const { data: box, error: boxError } = await supabase
    .from('boxes')
    .insert({
      reception_id: receptionId,
      box_code: boxCode,
      brand_id: firstLot.brandId || null,
      model_id: firstLot.modelId || null,
      capacity: declaredQuantity,
      declared_quantity: declaredQuantity,
      declared_quantity_original: declaredQuantity,
      status: 'en_captura',
      rack_location: 'PX_CAPTURA',
    })
    .select('id, box_code, status, declared_quantity, brand_id, model_id')
    .single();

  if (boxError) {
    if (boxError.message.includes('boxes_reception_id_box_code_key')) {
      return { success: false, error: `La caja ${boxCode} ya existe en esta recepción.` };
    }
    return { success: false, error: boxError.message };
  }

  const lotRows = lots.map((lot) => ({
    reception_id: receptionId,
    box_id: box.id,
    technology_name: lot.technologyName || null,
    brand_id: lot.brandId || null,
    model_id: lot.modelId || null,
    brand_name: lot.brandName || null,
    model_name: lot.modelName || null,
    expected_units: lot.expectedUnits,
    material: lot.material || null,
  }));

  const { error: lotsError } = await supabase.from('px_reception_lots').insert(lotRows);
  if (lotsError) {
    await supabase.from('boxes').delete().eq('id', box.id);
    return { success: false, error: lotsError.message };
  }

  const snapshot: PxBoxSnapshot = {
    id: box.id,
    box_code: box.box_code,
    status: box.status,
    declared_quantity: box.declared_quantity ?? declaredQuantity,
    captured_count: 0,
    brand_id: box.brand_id,
    model_id: box.model_id,
    version: 1,
    lots: lotRows.map((l, i) => ({
      id: `lot-${i}`,
      technology_name: l.technology_name,
      brand_name: l.brand_name,
      model_name: l.model_name,
      expected_units: l.expected_units,
      brand_id: l.brand_id,
      model_id: l.model_id,
    })),
    equipment: [],
  };

  return { success: true, box: snapshot };
}

/** Agrega lote(s) a caja existente y actualiza cantidad declarada. */
export async function appendPxCaptureLots(
  boxId: string,
  lots: PxLotInput[]
): Promise<{ success: true; declaredQuantity: number } | { success: false; error: string }> {
  const supabase = getSupabaseServerClient();
  const addUnits = lots.reduce((acc, l) => acc + (l.expectedUnits || 0), 0);
  if (addUnits <= 0) {
    return { success: false, error: 'El lote debe tener cantidad esperada mayor a cero.' };
  }

  const { data: box, error: boxErr } = await supabase
    .from('boxes')
    .select('id, reception_id, status, declared_quantity, capacity, version')
    .eq('id', boxId)
    .maybeSingle();

  if (boxErr || !box) return { success: false, error: 'Caja no encontrada.' };
  if (box.status === 'cerrada' || box.status === 'closed') {
    return { success: false, error: 'No se pueden agregar lotes a una caja cerrada.' };
  }

  const lotRows = lots.map((lot) => ({
    reception_id: box.reception_id,
    box_id: box.id,
    technology_name: lot.technologyName || null,
    brand_id: lot.brandId || null,
    model_id: lot.modelId || null,
    brand_name: lot.brandName || null,
    model_name: lot.modelName || null,
    expected_units: lot.expectedUnits,
    material: lot.material || null,
  }));

  const { error: lotsError } = await supabase.from('px_reception_lots').insert(lotRows);
  if (lotsError) return { success: false, error: lotsError.message };

  const newDeclared = (box.declared_quantity ?? box.capacity ?? 0) + addUnits;
  const { error: updErr } = await supabase
    .from('boxes')
    .update({
      declared_quantity: newDeclared,
      capacity: newDeclared,
      version: (box.version ?? 1) + 1,
    })
    .eq('id', boxId);

  if (updErr) return { success: false, error: updErr.message };
  return { success: true, declaredQuantity: newDeclared };
}

export async function getPxReceptionSnapshot(receptionId: string): Promise<PxReceptionSnapshot | null> {
  const supabase = getSupabaseServerClient();

  const { data: reception, error } = await supabase
    .from('receptions')
    .select('id, guide_number, status, sap_document, carrier, notes, expected_units, expected_units_sap, received_units, variance_units, variance_reason, version, created_at')
    .eq('id', receptionId)
    .maybeSingle();

  if (error || !reception) return null;

  const [{ data: boxes }, { data: lots }, { data: equipment }] = await Promise.all([
    supabase
      .from('boxes')
      .select('id, box_code, status, declared_quantity, declared_quantity_original, capacity, brand_id, model_id, version, locked_by, lock_expires_at, assigned_operator_id, is_partial_box, partial_box_reason, quantity_adjustment_reason')
      .eq('reception_id', receptionId)
      .neq('rack_location', 'ELIMINADO')
      .order('created_at', { ascending: true }),
    supabase.from('px_reception_lots').select('*').eq('reception_id', receptionId),
    supabase
      .from('px_reception_equipment')
      .select('id, box_id, main_serial, serial_s2, serial_s3, serial_s4, material, captured_at')
      .eq('reception_id', receptionId)
      .eq('capture_status', 'active')
      .order('captured_at', { ascending: true }),
  ]);

  const lotsByBox = new Map<string, typeof lots>();
  for (const lot of lots || []) {
    if (!lotsByBox.has(lot.box_id)) lotsByBox.set(lot.box_id, []);
    lotsByBox.get(lot.box_id)!.push(lot);
  }

  const equipByBox = new Map<string, PxEquipmentRow[]>();
  for (const eq of equipment || []) {
    if (!equipByBox.has(eq.box_id)) equipByBox.set(eq.box_id, []);
    equipByBox.get(eq.box_id)!.push({
      id: eq.id,
      main_serial: eq.main_serial,
      serial_s2: eq.serial_s2,
      serial_s3: eq.serial_s3,
      serial_s4: eq.serial_s4,
      material: eq.material,
      captured_at: eq.captured_at,
    });
  }

  const boxSnapshots: PxBoxSnapshot[] = (boxes || []).map((b) => {
    const eq = equipByBox.get(b.id) || [];
    return {
      id: b.id,
      box_code: b.box_code,
      status: b.status,
      declared_quantity: b.declared_quantity ?? b.capacity ?? 0,
      declared_quantity_original: b.declared_quantity_original,
      captured_count: eq.length,
      brand_id: b.brand_id,
      model_id: b.model_id,
      version: b.version ?? 1,
      locked_by: b.locked_by,
      lock_expires_at: b.lock_expires_at,
      assigned_operator_id: b.assigned_operator_id,
      is_partial_box: b.is_partial_box,
      partial_box_reason: b.partial_box_reason,
      quantity_adjustment_reason: b.quantity_adjustment_reason,
      lots: (lotsByBox.get(b.id) || []).map((l) => ({
        id: l.id,
        technology_name: l.technology_name,
        brand_name: l.brand_name,
        model_name: l.model_name,
        expected_units: l.expected_units,
        brand_id: l.brand_id,
        model_id: l.model_id,
      })),
      equipment: eq,
    };
  });

  const total_captured = boxSnapshots.reduce((acc, b) => acc + b.captured_count, 0);

  return {
    reception: reception as PxReceptionSnapshot['reception'],
    boxes: boxSnapshots,
    total_captured,
  };
}

export type PxReceptionSyncStamp = { version: number; fingerprint: string };

// Fórmula ÚNICA de huella de sincronización. La consume tanto el servidor
// (getPxReceptionSyncStamp, desde la BD) como el cliente (pxFingerprintFromSnapshot,
// desde el snapshot). Cualquier cambio debe mantener ambos lados idénticos.
function pxFingerprintParts(parts: {
  version: number;
  receivedUnits: number;
  status: string;
  boxCount: number;
  boxVersionSum: number;
  activeEquip: number;
}): string {
  return [
    parts.version,
    parts.receivedUnits,
    parts.status,
    parts.boxCount,
    parts.boxVersionSum,
    parts.activeEquip,
  ].join('|');
}

/** Huella derivada del snapshot ya descargado (lado cliente). */
export function pxFingerprintFromSnapshot(snap: PxReceptionSnapshot): string {
  return pxFingerprintParts({
    version: snap.reception.version ?? 1,
    receivedUnits: snap.reception.received_units ?? 0,
    status: snap.reception.status ?? '',
    boxCount: snap.boxes.length,
    boxVersionSum: snap.boxes.reduce((acc, b) => acc + (b.version ?? 1), 0),
    activeEquip: snap.total_captured ?? 0,
  });
}

/**
 * Huella ligera para el sondeo de sincronización: evita descargar el snapshot
 * completo (seriales/lotes) en cada tick. Solo lee cabecera + (version) de cajas
 * + conteo de equipos activos → unos pocos cientos de bytes vs decenas/cientos KB.
 * Reduce drásticamente el egress de Supabase durante recepciones abiertas.
 */
export async function getPxReceptionSyncStamp(
  receptionId: string
): Promise<PxReceptionSyncStamp | null> {
  const supabase = getSupabaseServerClient();

  const { data: reception, error } = await supabase
    .from('receptions')
    .select('version, received_units, status')
    .eq('id', receptionId)
    .maybeSingle();

  if (error || !reception) return null;

  const [{ data: boxes }, { count: activeEquip }] = await Promise.all([
    supabase
      .from('boxes')
      .select('version')
      .eq('reception_id', receptionId)
      .neq('rack_location', 'ELIMINADO'),
    supabase
      .from('px_reception_equipment')
      .select('id', { count: 'exact', head: true })
      .eq('reception_id', receptionId)
      .eq('capture_status', 'active'),
  ]);

  const boxArr = boxes || [];

  return {
    version: reception.version ?? 1,
    fingerprint: pxFingerprintParts({
      version: reception.version ?? 1,
      receivedUnits: reception.received_units ?? 0,
      status: reception.status ?? '',
      boxCount: boxArr.length,
      boxVersionSum: boxArr.reduce((acc, b) => acc + (b.version ?? 1), 0),
      activeEquip: activeEquip ?? 0,
    }),
  };
}

export function mapRpcCaptureError(message: string): string {
  const msg = message || '';
  if (msg.includes('DUPLICATE_IN_RECEPTION')) {
    return 'Una o más series ya fueron capturadas en esta recepción.';
  }
  if (msg.includes('DUPLICATE_GLOBAL')) {
    return msg.replace(/^.*DUPLICATE_GLOBAL:\s*/i, '🚫 Serie en inventario activo: ');
  }
  if (msg.includes('DUPLICATE_IN_EQUIPMENT')) {
    return 'Series duplicadas en el mismo equipo.';
  }
  if (msg.includes('BOX_FULL')) {
    return 'La caja alcanzó su capacidad declarada.';
  }
  if (msg.includes('BOX_LOCKED') || msg.includes('BOX_NOT_LOCKED')) {
    if (msg.includes('BOX_NOT_LOCKED')) return 'Debe tomar control de la caja antes de escanear.';
    return msg.replace(/^.*BOX_LOCKED:\s*/i, '');
  }
  if (msg.includes('VERSION_CONFLICT')) {
    return 'Conflicto de versión: otro operador modificó la caja. Recargue e intente de nuevo.';
  }
  if (msg.includes('PARTIAL_REASON_REQUIRED')) {
    return 'Indique motivo de caja parcial o ajuste la cantidad esperada antes de cerrar.';
  }
  if (msg.includes('REASON_REQUIRED')) {
    return 'Motivo obligatorio para ajustar la cantidad.';
  }
  if (msg.includes('QUANTITY_BELOW_CAPTURED')) {
    return msg.replace(/^.*QUANTITY_BELOW_CAPTURED:\s*/i, '');
  }
  if (msg.includes('INVALID_STATE')) {
    return 'La recepción no está en proceso o la caja no puede reabrirse en este estado.';
  }
  if (msg.includes('VARIANCE_REASON_REQUIRED')) {
    return msg.replace(/^.*VARIANCE_REASON_REQUIRED:\s*/i, '');
  }
  if (msg.includes('BOX_NOT_CLOSED')) {
    return msg.replace(/^.*BOX_NOT_CLOSED:\s*/i, '');
  }
  if (msg.includes('RECEPTION_EMPTY')) {
    return 'No hay equipos capturados para finalizar.';
  }
  return msg;
}

function scheduleReceptionReceivedUnitsSync(receptionId: string) {
  void (async () => {
    try {
      const supabase = getSupabaseServerClient();
      const { count: totalCaptured } = await supabase
        .from('px_reception_equipment')
        .select('id', { count: 'exact', head: true })
        .eq('reception_id', receptionId)
        .eq('capture_status', 'active');

      await supabase
        .from('receptions')
        .update({ received_units: totalCaptured || 0 })
        .eq('id', receptionId);
    } catch (e) {
      console.error('scheduleReceptionReceivedUnitsSync:', e);
    }
  })();
}

function scheduleCapturePxEquipmentSideEffects(
  input: {
    receptionId: string;
    boxId: string;
    mainSerial: string;
  },
  payload: {
    equipment_id: string;
    captured_count: number;
    declared_quantity: number;
    box_status: string;
  },
  started: number
) {
  void (async () => {
    try {
      const supabase = getSupabaseServerClient();
      const { count: totalCaptured } = await supabase
        .from('px_reception_equipment')
        .select('id', { count: 'exact', head: true })
        .eq('reception_id', input.receptionId)
        .eq('capture_status', 'active');

      await supabase
        .from('receptions')
        .update({ received_units: totalCaptured || 0 })
        .eq('id', input.receptionId);

      await emitPxDomainEvent('EquipmentCaptured', input.receptionId, {
        box_id: input.boxId,
        equipment_id: payload.equipment_id,
        main_serial: input.mainSerial.trim().toUpperCase(),
      });
      await emitPxCaptureMetric({
        receptionId: input.receptionId,
        boxId: input.boxId,
        action: 'capture_px_equipment',
        outcome: 'success',
        durationMs: Date.now() - started,
      });
    } catch (e) {
      console.error('capturePxEquipment side effects:', e);
    }
  })();
}

export async function capturePxEquipment(input: {
  receptionId: string;
  boxId: string;
  mainSerial: string;
  serialS2?: string;
  serialS3?: string;
  serialS4?: string;
  brandId?: string | null;
  modelId?: string | null;
  material?: string | null;
  operatorId?: string | null;
  operatorName?: string;
  workstationLabel?: string | null;
}): Promise<
  | { success: true; equipmentId: string; capturedCount: number; declaredQuantity: number; boxStatus: string }
  | { success: false; error: string; errorCode?: string }
> {
  const started = Date.now();
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase.rpc('capture_px_equipment_tx', {
    p_reception_id: input.receptionId,
    p_box_id: input.boxId,
    p_main_serial: input.mainSerial.trim().toUpperCase(),
    p_serial_s2: input.serialS2?.trim().toUpperCase() || null,
    p_serial_s3: input.serialS3?.trim().toUpperCase() || null,
    p_serial_s4: input.serialS4?.trim().toUpperCase() || null,
    p_brand_id: input.brandId || null,
    p_model_id: input.modelId || null,
    p_material: input.material || null,
    p_captured_by: input.operatorId || null,
    p_operator_name: input.operatorName || 'OPERADOR',
    p_workstation: input.workstationLabel || null,
  });

  if (error) {
    const errorCode = (error.message.match(/^([A-Z_]+):/) || [])[1] || 'RPC_ERROR';
    await emitPxCaptureMetric({
      receptionId: input.receptionId,
      boxId: input.boxId,
      action: 'capture_px_equipment',
      outcome: 'error',
      errorCode,
      durationMs: Date.now() - started,
      metadata: { message: error.message },
    });
    return { success: false, error: mapRpcCaptureError(error.message), errorCode };
  }

  const payload = data as {
    equipment_id: string;
    captured_count: number;
    declared_quantity: number;
    box_status: string;
  };

  scheduleCapturePxEquipmentSideEffects(input, payload, started);

  return {
    success: true,
    equipmentId: payload.equipment_id,
    capturedCount: payload.captured_count,
    declaredQuantity: payload.declared_quantity,
    boxStatus: payload.box_status,
  };
}

export async function voidPxEquipment(input: {
  receptionId: string;
  boxId: string;
  equipmentId?: string | null;
  mainSerial?: string | null;
  operatorId?: string | null;
  operatorName?: string;
}): Promise<
  | {
      success: true;
      equipmentId: string;
      mainSerial: string;
      capturedCount: number;
      declaredQuantity: number;
      boxStatus: string;
      version: number;
    }
  | { success: false; error: string; errorCode?: string }
> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('void_px_equipment_tx', {
    p_reception_id: input.receptionId,
    p_box_id: input.boxId,
    p_equipment_id: input.equipmentId || null,
    p_operator_id: input.operatorId || null,
    p_operator_name: input.operatorName || 'OPERADOR',
    p_main_serial: input.mainSerial?.trim().toUpperCase() || null,
  });

  if (error) {
    const errorCode = (error.message.match(/^([A-Z_]+):/) || [])[1] || 'RPC_ERROR';
    return { success: false, error: mapRpcCaptureError(error.message), errorCode };
  }

  const payload = data as {
    equipment_id: string;
    main_serial: string;
    captured_count: number;
    declared_quantity: number;
    box_status: string;
    version: number;
  };

  scheduleReceptionReceivedUnitsSync(input.receptionId);

  return {
    success: true,
    equipmentId: payload.equipment_id,
    mainSerial: payload.main_serial,
    capturedCount: payload.captured_count,
    declaredQuantity: payload.declared_quantity,
    boxStatus: payload.box_status,
    version: payload.version,
  };
}

export async function deletePxCaptureBox(input: {
  receptionId: string;
  boxId: string;
  expectedVersion: number;
  operatorId?: string | null;
  operatorName?: string;
}): Promise<
  | { success: true; boxId: string; boxCode: string; version: number }
  | { success: false; error: string; errorCode?: string }
> {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('delete_px_capture_box_tx', {
    p_reception_id: input.receptionId,
    p_box_id: input.boxId,
    p_expected_version: input.expectedVersion,
    p_operator_id: input.operatorId || null,
    p_operator_name: input.operatorName || 'OPERADOR',
  });

  if (error) {
    const errorCode = (error.message.match(/^([A-Z_]+):/) || [])[1] || 'RPC_ERROR';
    return { success: false, error: mapRpcCaptureError(error.message), errorCode };
  }

  const payload = data as { box_id: string; box_code: string; version: number };
  scheduleReceptionReceivedUnitsSync(input.receptionId);

  return {
    success: true,
    boxId: payload.box_id,
    boxCode: payload.box_code,
    version: payload.version,
  };
}

export async function acquireBoxLock(input: {
  boxId: string;
  operatorId?: string | null;
  operatorName?: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('acquire_box_lock_tx', {
    p_box_id: input.boxId,
    p_operator_id: input.operatorId || null,
    p_operator_name: input.operatorName || 'OPERADOR',
  });
  if (error) return { success: false as const, error: mapRpcCaptureError(error.message) };
  return { success: true as const, data: data as { version: number } };
}

export async function releaseBoxLock(input: {
  boxId: string;
  operatorId?: string | null;
  reason?: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('release_box_lock_tx', {
    p_box_id: input.boxId,
    p_operator_id: input.operatorId || null,
    p_reason: input.reason || 'manual_release',
  });
  if (error) return { success: false as const, error: mapRpcCaptureError(error.message) };
  return { success: true as const, data };
}

export async function adjustPxBoxQuantity(input: {
  boxId: string;
  newDeclaredQuantity: number;
  reason: string;
  expectedVersion: number;
  operatorId?: string | null;
  operatorName?: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('adjust_px_box_quantity_tx', {
    p_box_id: input.boxId,
    p_new_declared_quantity: input.newDeclaredQuantity,
    p_reason: input.reason,
    p_expected_version: input.expectedVersion,
    p_operator_id: input.operatorId || null,
    p_operator_name: input.operatorName || 'OPERADOR',
  });
  if (error) return { success: false as const, error: mapRpcCaptureError(error.message) };
  return { success: true as const, data };
}

export async function closePxBox(input: {
  boxId: string;
  expectedVersion: number;
  partialReason?: string;
  operatorId?: string | null;
  operatorName?: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('close_px_box_tx', {
    p_box_id: input.boxId,
    p_expected_version: input.expectedVersion,
    p_partial_reason: input.partialReason || null,
    p_operator_id: input.operatorId || null,
    p_operator_name: input.operatorName || 'OPERADOR',
  });
  if (error) return { success: false as const, error: mapRpcCaptureError(error.message) };
  return { success: true as const, data };
}

export async function promotePxBox(input: {
  boxId: string;
  operatorId?: string | null;
  operatorName?: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('promote_px_box_tx', {
    p_box_id: input.boxId,
    p_operator_id: input.operatorId || null,
    p_operator_name: input.operatorName || 'OPERADOR',
  });
  if (error) return { success: false as const, error: mapRpcCaptureError(error.message) };
  return { success: true as const, data };
}

export async function reopenPxBox(input: {
  boxId: string;
  expectedVersion: number;
  reason?: string;
  operatorId?: string | null;
  operatorName?: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('reopen_px_box_tx', {
    p_box_id: input.boxId,
    p_expected_version: input.expectedVersion,
    p_reason: input.reason || null,
    p_operator_id: input.operatorId || null,
    p_operator_name: input.operatorName || 'OPERADOR',
  });
  if (error) return { success: false as const, error: mapRpcCaptureError(error.message) };
  return { success: true as const, data };
}

export async function updatePxReceptionHeader(input: {
  receptionId: string;
  guideData: GuideData;
  operatorName: string;
  expectedVersion: number;
}): Promise<{ success: true; version: number } | { success: false; error: string }> {
  const supabase = getSupabaseServerClient();
  const { data: rec } = await supabase
    .from('receptions')
    .select('id, status, version')
    .eq('id', input.receptionId)
    .maybeSingle();

  if (!rec || rec.status !== PX_IN_PROGRESS) {
    return { success: false, error: 'Recepción no encontrada o no está EN_PROCESO.' };
  }
  if ((rec.version ?? 1) !== input.expectedVersion) {
    return { success: false, error: 'Conflicto de versión: recargue e intente de nuevo.' };
  }

  const totalCajas = input.guideData.totalCajasEsperadas || 1;
  const { data, error } = await supabase
    .from('receptions')
    .update({
      sap_document: input.guideData.sap?.trim() || null,
      carrier: input.guideData.proveedorPx || 'N/A',
      notes: buildPxNotes(input.guideData, input.operatorName, totalCajas),
      expected_units_sap: totalCajas,
      version: (rec.version ?? 1) + 1,
    })
    .eq('id', input.receptionId)
    .select('version')
    .single();

  if (error) return { success: false, error: error.message };
  return { success: true, version: data.version ?? input.expectedVersion + 1 };
}

export async function finalizePxReception(input: {
  receptionId: string;
  expectedVersion: number;
  varianceReason?: string;
  operatorId?: string | null;
  operatorName?: string;
}): Promise<
  | {
      success: true;
      data: {
        reception_id: string;
        guide_number: string;
        status: string;
        received_units: number;
        expected_units: number;
        is_partial: boolean;
        already_finalized?: boolean;
      };
    }
  | { success: false; error: string }
> {
  const started = Date.now();
  const supabase = getSupabaseServerClient();

  const { data, error } = await supabase.rpc('finalize_px_reception_tx', {
    p_reception_id: input.receptionId,
    p_expected_version: input.expectedVersion,
    p_variance_reason: input.varianceReason || null,
    p_operator_id: input.operatorId || null,
    p_operator_name: input.operatorName || 'OPERADOR',
  });

  if (error) {
    await emitPxCaptureMetric({
      receptionId: input.receptionId,
      action: 'finalize_px_reception',
      outcome: 'error',
      errorCode: (error.message.match(/^([A-Z_]+):/) || [])[1] || 'RPC_ERROR',
      durationMs: Date.now() - started,
      metadata: { message: error.message },
    });
    return { success: false, error: mapRpcCaptureError(error.message) };
  }

  const payload = data as {
    reception_id: string;
    guide_number: string;
    status: string;
    received_units: number;
    expected_units: number;
    is_partial: boolean;
    already_finalized?: boolean;
  };

  await emitPxDomainEvent(
    payload.is_partial ? 'ReceptionPartiallyCompleted' : 'ReceptionCompleted',
    input.receptionId,
    payload as Record<string, unknown>
  );
  await emitPxCaptureMetric({
    receptionId: input.receptionId,
    action: 'finalize_px_reception',
    outcome: 'success',
    durationMs: Date.now() - started,
    metadata: payload as Record<string, unknown>,
  });

  return { success: true, data: payload };
}

/** Adapta snapshot servidor → estado UI legacy (manifestItems + scannedSeries). */
export function snapshotToPxUiState(snapshot: PxReceptionSnapshot): {
  manifestItems: Array<{
    id: string;
    boxCode: string;
    tecnologia: string;
    marca: string;
    modelo: string;
    totalEsperado: number;
    material?: string;
  }>;
  scannedSeries: Array<{
    boxCode: string;
    sn: string;
    s2?: string;
    s3?: string;
    s4?: string;
    material?: string;
    equipmentId?: string;
  }>;
  closedBoxes: string[];
  boxIdByCode: Record<string, string>;
  boxVersionByCode: Record<string, number>;
  boxMetaByCode: Record<string, PxBoxSnapshot>;
} {
  const manifestItems: ReturnType<typeof snapshotToPxUiState>['manifestItems'] = [];
  const scannedSeries: ReturnType<typeof snapshotToPxUiState>['scannedSeries'] = [];
  const closedBoxes: string[] = [];
  const boxIdByCode: Record<string, string> = {};
  const boxVersionByCode: Record<string, number> = {};
  const boxMetaByCode: Record<string, PxBoxSnapshot> = {};

  for (const box of snapshot.boxes) {
    boxIdByCode[box.box_code] = box.id;
    boxVersionByCode[box.box_code] = box.version ?? 1;
    boxMetaByCode[box.box_code] = box;
    if (box.status === 'cerrada' || box.status === 'closed') {
      closedBoxes.push(box.box_code);
    }
    for (const lot of box.lots) {
      manifestItems.push({
        id: lot.id,
        boxCode: box.box_code,
        tecnologia: lot.technology_name || '',
        marca: lot.brand_name || '',
        modelo: lot.model_name || '',
        totalEsperado: lot.expected_units,
      });
    }
    for (const eq of box.equipment) {
      scannedSeries.push({
        boxCode: box.box_code,
        sn: eq.main_serial,
        s2: eq.serial_s2 || undefined,
        s3: eq.serial_s3 || undefined,
        s4: eq.serial_s4 || undefined,
        material: eq.material || undefined,
        equipmentId: eq.id,
      });
    }
  }

  return { manifestItems, scannedSeries, closedBoxes, boxIdByCode, boxVersionByCode, boxMetaByCode };
}

export function snapshotToGuideData(snapshot: PxReceptionSnapshot): Partial<GuideData> {
  const notes = snapshot.reception.notes || '';
  const docMatch = notes.match(/^DOC Ref:\s*(.+)$/m);
  const pilotoMatch = notes.match(/^Piloto:\s*(.+)$/m);
  const courierMatch = notes.match(/^Courier:\s*(.+)$/m);
  return {
    sap: snapshot.reception.sap_document || '',
    docReferencia: docMatch?.[1]?.trim() === '---' ? '' : docMatch?.[1]?.trim() || '',
    proveedorPx: snapshot.reception.carrier || '',
    guia: snapshot.reception.guide_number,
    piloto: pilotoMatch?.[1]?.trim() === '---' ? '' : pilotoMatch?.[1]?.trim() || '',
    courier: courierMatch?.[1]?.trim() === '---' ? '' : courierMatch?.[1]?.trim() || '',
    totalCajasEsperadas: snapshot.reception.expected_units_sap || 1,
  };
}
