import { getSupabaseServerClient } from '@/lib/supabase/server';
import { asUuidOrNull } from '@/lib/database/warehouse';
import {
  type PxBoxSnapshot,
  type PxEquipmentRow,
  type PxLotInput,
  type PxRejectedSerialScan,
  type PxReceptionSnapshot,
  nextFreePxBoxCode,
  pxFingerprintFromSnapshot,
  snapshotToGuideData,
  snapshotToPxUiState,
} from '@/lib/database/pxReceptionCapture.shared';
import { resolvePxBoxLimit, getPxFinalizePromoteBatchSize, BATCH_LIMITS } from '@/shared/constants/batchLimits';
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
const PX_FINALIZING = 'FINALIZANDO';

export type {
  PxLotInput,
  PxBoxSnapshot,
  PxEquipmentRow,
  PxReceptionSnapshot,
} from '@/lib/database/pxReceptionCapture.shared';

export {
  pxFingerprintFromSnapshot,
  snapshotToGuideData,
  snapshotToPxUiState,
};

export type PxStartInput = {
  guideData: GuideData;
  operatorName: string;
  operatorId?: string | null;
  preferredGuideNumber?: string;
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
      .in('status', [
        'CLASIFICADA',
        'RECEPCIONADA',
        'PENDIENTE_BACKOFFICE',
        PX_IN_PROGRESS,
        PX_FINALIZING,
      ])
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
      .in('status', [
        'CLASIFICADA',
        'RECEPCIONADA',
        'PENDIENTE_BACKOFFICE',
        PX_IN_PROGRESS,
        PX_FINALIZING,
      ])
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
    p_expected_units_sap: resolvePxBoxLimit(input.guideData.totalCajasEsperadas),
    p_preferred_guide: input.preferredGuideNumber || input.guideData.guia || null,
    p_operator_id: asUuidOrNull(input.operatorId),
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
  Array<{
    id: string;
    guide_number: string;
    sap_document: string | null;
    created_at: string;
    status: string;
    captured_count: number;
    promoted_count: number;
  }>
> {
  const supabase = getSupabaseServerClient();
  const { data: receptions, error } = await supabase
    .from('receptions')
    .select('id, guide_number, sap_document, created_at, status')
    .eq('source', 'px')
    .in('status', [PX_IN_PROGRESS, PX_FINALIZING])
    .order('created_at', { ascending: false });

  if (error || !receptions?.length) return [];

  const ids = receptions.map((r) => r.id);
  const { data: counts } = await supabase
    .from('px_reception_equipment')
    .select('reception_id, capture_status')
    .in('reception_id', ids)
    .in('capture_status', ['active', 'promoted']);

  const activeByRec = new Map<string, number>();
  const promotedByRec = new Map<string, number>();
  for (const row of counts || []) {
    const target = row.capture_status === 'promoted' ? promotedByRec : activeByRec;
    target.set(row.reception_id, (target.get(row.reception_id) || 0) + 1);
  }

  return receptions.map((r) => ({
    ...r,
    captured_count: activeByRec.get(r.id) || 0,
    promoted_count: promotedByRec.get(r.id) || 0,
  }));
}

type PxCreatedBoxRow = {
  id: string;
  box_code: string;
  status: string;
  declared_quantity: number | null;
  brand_id: string | null;
  model_id: string | null;
};

const PX_BOX_CODE_MAX_ATTEMPTS = 5;

function isPxBoxCodeConflict(message: string): boolean {
  return message.includes('boxes_reception_id_box_code_key') || message.includes('box_code');
}

/** Incluye cajas eliminadas: su código sigue ocupando el UNIQUE de la recepción. */
async function resolveFreePxBoxCode(receptionId: string, requestedCode: string): Promise<string> {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase.from('boxes').select('box_code').eq('reception_id', receptionId);
  return nextFreePxBoxCode(
    (data ?? []).map((row) => String(row.box_code ?? '')),
    requestedCode
  );
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

  const maxBoxes = resolvePxBoxLimit(rec.expected_units_sap);
  if ((existingBoxCount || 0) >= maxBoxes) {
    return {
      success: false,
      error: `Límite de ${maxBoxes} caja(s) alcanzado. Edite "Cantidad Total Cajas" en la cabecera (máx. ${resolvePxBoxLimit(null)}).`,
    };
  }

  const declaredQuantity = lots.reduce((acc, l) => acc + (l.expectedUnits || 0), 0);
  if (declaredQuantity <= 0) {
    return { success: false, error: 'La caja debe tener al menos un lote con cantidad esperada.' };
  }

  const firstLot = lots[0];
  let attemptCode = await resolveFreePxBoxCode(receptionId, boxCode);
  let box: PxCreatedBoxRow | null = null;

  for (let attempt = 0; attempt < PX_BOX_CODE_MAX_ATTEMPTS; attempt += 1) {
    const { data, error: boxError } = await supabase
      .from('boxes')
      .insert({
        reception_id: receptionId,
        box_code: attemptCode,
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

    if (!boxError) {
      box = data as PxCreatedBoxRow;
      break;
    }
    if (!isPxBoxCodeConflict(boxError.message)) {
      return { success: false, error: boxError.message };
    }
    attemptCode = await resolveFreePxBoxCode(receptionId, attemptCode);
  }

  if (!box) {
    return {
      success: false,
      error: 'No se pudo asignar un código de caja libre. Refresque la recepción e intente de nuevo.',
    };
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
    rejected_count: 0,
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
    rejections: [],
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

export async function getPxReceptionSnapshot(
  receptionId: string,
  options?: { includeEquipment?: boolean }
): Promise<PxReceptionSnapshot | null> {
  const includeEquipment = options?.includeEquipment ?? false;
  const supabase = getSupabaseServerClient();

  const { data: reception, error } = await supabase
    .from('receptions')
    .select('id, guide_number, status, sap_document, carrier, notes, expected_units, expected_units_sap, received_units, variance_units, variance_reason, version, created_at')
    .eq('id', receptionId)
    .maybeSingle();

  if (error || !reception) return null;

  const equipmentQuery = includeEquipment
    ? supabase
        .from('px_reception_equipment')
        .select('id, box_id, main_serial, serial_s2, serial_s3, serial_s4, material, captured_at')
        .eq('reception_id', receptionId)
        .eq('capture_status', 'active')
        .order('captured_at', { ascending: true })
    : supabase
        .from('px_reception_equipment')
        .select('box_id')
        .eq('reception_id', receptionId)
        .eq('capture_status', 'active');

  const [{ data: boxes }, { data: lots }, { data: equipment }, { data: rejections }] = await Promise.all([
    supabase
      .from('boxes')
      .select('id, box_code, status, declared_quantity, declared_quantity_original, capacity, brand_id, model_id, version, locked_by, lock_expires_at, assigned_operator_id, is_partial_box, partial_box_reason, quantity_adjustment_reason')
      .eq('reception_id', receptionId)
      .neq('rack_location', 'ELIMINADO')
      .order('created_at', { ascending: true }),
    supabase
      .from('px_reception_lots')
      .select('id, box_id, technology_name, brand_name, model_name, expected_units, brand_id, model_id')
      .eq('reception_id', receptionId),
    equipmentQuery,
    supabase
      .from('px_rejected_serial_scans')
      .select('id, box_id, serial_number, error_code, existing_os_id, existing_os_number, existing_os_status, existing_source, created_at')
      .eq('reception_id', receptionId)
      .order('created_at', { ascending: false }),
  ]);

  const lotsByBox = new Map<string, typeof lots>();
  for (const lot of lots || []) {
    if (!lotsByBox.has(lot.box_id)) lotsByBox.set(lot.box_id, []);
    lotsByBox.get(lot.box_id)!.push(lot);
  }

  const equipByBox = new Map<string, PxEquipmentRow[]>();
  const countByBox = new Map<string, number>();
  const rejectionsByBox = new Map<string, PxRejectedSerialScan[]>();

  for (const rejected of rejections || []) {
    const boxId = String(rejected.box_id);
    if (!rejectionsByBox.has(boxId)) rejectionsByBox.set(boxId, []);
    rejectionsByBox.get(boxId)!.push({
      id: rejected.id,
      serial_number: rejected.serial_number,
      error_code: 'DUPLICATE_OPEN_OS',
      existing_os_id: rejected.existing_os_id,
      existing_os_number: rejected.existing_os_number,
      existing_os_status: rejected.existing_os_status,
      existing_source: rejected.existing_source,
      created_at: rejected.created_at,
    });
  }

  for (const eq of equipment || []) {
    const equipmentRow = eq as unknown as PxEquipmentRow & { box_id: string };
    const boxId = String(equipmentRow.box_id);
    countByBox.set(boxId, (countByBox.get(boxId) || 0) + 1);

    if (includeEquipment && 'main_serial' in equipmentRow) {
      if (!equipByBox.has(boxId)) equipByBox.set(boxId, []);
      equipByBox.get(boxId)!.push({
        id: equipmentRow.id,
        main_serial: equipmentRow.main_serial,
        serial_s2: equipmentRow.serial_s2,
        serial_s3: equipmentRow.serial_s3,
        serial_s4: equipmentRow.serial_s4,
        material: equipmentRow.material,
        captured_at: equipmentRow.captured_at,
      });
    }
  }

  const boxSnapshots: PxBoxSnapshot[] = (boxes || []).map((b) => {
    const eq = equipByBox.get(b.id) || [];
    const boxRejections = rejectionsByBox.get(b.id) || [];
    const capturedCount = includeEquipment ? eq.length : countByBox.get(b.id) || 0;
    return {
      id: b.id,
      box_code: b.box_code,
      status: b.status,
      declared_quantity: b.declared_quantity ?? b.capacity ?? 0,
      declared_quantity_original: b.declared_quantity_original,
      captured_count: capturedCount,
      rejected_count: boxRejections.length,
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
      rejections: boxRejections,
    };
  });

  const total_captured = boxSnapshots.reduce((acc, b) => acc + b.captured_count, 0);

  return {
    reception: reception as PxReceptionSnapshot['reception'],
    boxes: boxSnapshots,
    total_captured,
  };
}

/** Meta ligera de una caja — evita GET snapshot completo en conflictos de versión. */
export async function getPxBoxMeta(boxId: string): Promise<{
  id: string;
  box_code: string;
  status: string;
  declared_quantity: number;
  captured_count: number;
  rejected_count: number;
  version: number;
  locked_by: string | null;
  lock_expires_at: string | null;
} | null> {
  const supabase = getSupabaseServerClient();
  const { data: box, error } = await supabase
    .from('boxes')
    .select('id, box_code, status, declared_quantity, version, locked_by, lock_expires_at')
    .eq('id', boxId)
    .maybeSingle();
  if (error || !box) return null;

  const { count } = await supabase
    .from('px_reception_equipment')
    .select('id', { count: 'exact', head: true })
    .eq('box_id', boxId)
    .eq('capture_status', 'active');
  const { count: rejectedCount } = await supabase
    .from('px_rejected_serial_scans')
    .select('id', { count: 'exact', head: true })
    .eq('box_id', boxId)
    .eq('error_code', 'DUPLICATE_OPEN_OS');

  return {
    id: box.id,
    box_code: box.box_code,
    status: box.status,
    declared_quantity: box.declared_quantity ?? 0,
    captured_count: count ?? 0,
    rejected_count: rejectedCount ?? 0,
    version: box.version ?? 1,
    locked_by: box.locked_by ?? null,
    lock_expires_at: box.lock_expires_at ?? null,
  };
}

export type PxDuplicateOpenOsDetails = {
  serial: string;
  errorCode: 'DUPLICATE_OPEN_OS';
  error_code: 'DUPLICATE_OPEN_OS';
  existing_os_id: string | null;
  existing_os_number: string | null;
  existing_os_status: string | null;
  existing_source: string | null;
  rejected_count: number;
};

export function formatDuplicateOpenOsMessage(
  details: Pick<
    PxDuplicateOpenOsDetails,
    'serial' | 'existing_os_number' | 'existing_os_status'
  >,
): string {
  const os = details.existing_os_number || 'sin número disponible';
  const status = details.existing_os_status || 'sin estado disponible';
  return `SERIE DUPLICADA – ORDEN DE SERVICIO ABIERTA\n\nLa serie ${details.serial} ya se encuentra registrada en otra Orden de Servicio abierta.\n\nOS: ${os}\nEstado: ${status}\n\nEsta unidad NO puede ser ingresada nuevamente a PX. Debe resolverse la Orden de Servicio existente antes de realizar la recepción.`;
}

export function mapRpcCaptureError(message: string): string {
  const msg = message || '';
  if (msg.includes('DUPLICATE_OPEN_OS')) {
    return 'SERIE DUPLICADA – ORDEN DE SERVICIO ABIERTA. Esta unidad no puede ser ingresada nuevamente a PX.';
  }
  if (msg.includes('DUPLICATE_IN_OTHER_GUIDE')) {
    return msg.replace(
      /^.*DUPLICATE_IN_OTHER_GUIDE:\s*/i,
      'Serie ya capturada en otra guía. Elimine el duplicado antes de continuar: ',
    );
  }
  if (msg.includes('DUPLICATE_IN_RECEPTION')) {
    // Preferir texto del RPC (incluye guía/caja) cuando viene enriquecido
    if (/Elimine el duplicado/i.test(msg)) {
      return msg.replace(/^.*DUPLICATE_IN_RECEPTION:\s*/i, '');
    }
    return 'Serie repetida en esta recepción PX. Ya está en otra caja de esta guía — elimínela ahí antes de continuar.';
  }
  if (msg.includes('DUPLICATE_GLOBAL')) {
    return msg.replace(
      /^.*DUPLICATE_GLOBAL:\s*/i,
      'Serie ya en inventario TC (orden abierta). No capture de nuevo: ',
    );
  }
  if (msg.includes('DUPLICATE_IN_EQUIPMENT')) {
    return 'Serie repetida en el mismo equipo (mismo lote de caja). Revise que S1–S4 no estén duplicadas.';
  }
  if (msg.includes('BOX_FULL')) {
    return 'La caja alcanzó su capacidad declarada.';
  }
  if (msg.includes('BOX_EMPTY_DUPLICATE_OPEN_OS')) {
    return 'No es posible finalizar esta caja. No se registró ninguna unidad porque las series fueron rechazadas por existir en otras Órdenes de Servicio abiertas.';
  }
  if (msg.includes('ZERO_ACCEPTED_BOX')) {
    return msg.replace(/^.*ZERO_ACCEPTED_BOX:\s*/i, '');
  }
  if (msg.includes('BOX_EMPTY')) {
    return 'No es posible finalizar esta caja porque no tiene unidades aceptadas.';
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
  if (msg.includes('statement timeout') || msg.includes('57014')) {
    return 'La finalización tardó demasiado (timeout). Cierre todas las cajas e intente de nuevo.';
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
  | ({ success: false; error: string } & PxDuplicateOpenOsDetails)
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

  const payload = data as
    | {
        ok: true;
        equipment_id: string;
        captured_count: number;
        declared_quantity: number;
        box_status: string;
      }
    | {
        ok: false;
        code: 'DUPLICATE_OPEN_OS';
        error_code: 'DUPLICATE_OPEN_OS';
        serial: string;
        existing_os_id: string | null;
        existing_os_number: string | null;
        existing_os_status: string | null;
        existing_source: string | null;
        rejected_count: number;
        message: string;
      };

  if (payload.ok === false) {
    const details: PxDuplicateOpenOsDetails = {
      serial: payload.serial,
      errorCode: 'DUPLICATE_OPEN_OS',
      error_code: 'DUPLICATE_OPEN_OS',
      existing_os_id: payload.existing_os_id,
      existing_os_number: payload.existing_os_number,
      existing_os_status: payload.existing_os_status,
      existing_source: payload.existing_source,
      rejected_count: payload.rejected_count,
    };
    await emitPxCaptureMetric({
      receptionId: input.receptionId,
      boxId: input.boxId,
      action: 'capture_px_equipment',
      outcome: 'error',
      errorCode: details.errorCode,
      durationMs: Date.now() - started,
      metadata: details,
    });
    return {
      success: false,
      error: formatDuplicateOpenOsMessage(details),
      ...details,
    };
  }

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
    p_operator_id: asUuidOrNull(input.operatorId),
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
    p_operator_id: asUuidOrNull(input.operatorId),
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
    p_operator_id: asUuidOrNull(input.operatorId),
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
    p_operator_id: asUuidOrNull(input.operatorId),
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
    p_operator_id: asUuidOrNull(input.operatorId),
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
    p_operator_id: asUuidOrNull(input.operatorId),
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
    p_operator_id: asUuidOrNull(input.operatorId),
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
    p_operator_id: asUuidOrNull(input.operatorId),
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

  const totalCajas = resolvePxBoxLimit(input.guideData.totalCajasEsperadas);
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

type PxFinalizeRpcPayload = Record<string, unknown> & {
  phase?: string;
  already_finalized?: boolean;
  reception_id?: string;
  guide_number?: string;
  status?: string;
  received_units?: number;
  boxes_remaining?: number;
  promoted_this_batch?: number;
  remaining_active?: number;
};

async function callPxFinalizeRpc(
  functionName:
    | 'finalize_px_reception_prep_one_box_tx'
    | 'finalize_px_reception_batch_tx',
  args: unknown[],
): Promise<{ data: PxFinalizeRpcPayload | null; error: { message: string } | null }> {
  const { rpcViaDirectPostgres } = await import('@/lib/database/pgDirect');
  const direct = await rpcViaDirectPostgres<PxFinalizeRpcPayload>(
    `public.${functionName}`,
    args,
    { statementTimeout: '120s' },
  );

  if (!direct.error?.message || direct.error.message === 'NO_DATABASE_URL') {
    if (!direct.error) return { data: direct.data, error: null };
  }

  const supabase = getSupabaseServerClient();
  if (functionName === 'finalize_px_reception_prep_one_box_tx') {
    const rpc = await supabase.rpc(functionName, {
      p_reception_id: args[0],
      p_expected_version: args[1],
    });
    return {
      data: rpc.data as PxFinalizeRpcPayload | null,
      error: rpc.error ? { message: rpc.error.message } : null,
    };
  }

  const rpc = await supabase.rpc(functionName, {
    p_reception_id: args[0],
    p_expected_version: args[1],
    p_variance_reason: args[2],
    p_operator_id: asUuidOrNull(args[3] as string | null | undefined),
    p_operator_name: args[4],
    p_batch_size: args[5],
  });
  return {
    data: rpc.data as PxFinalizeRpcPayload | null,
    error: rpc.error ? { message: rpc.error.message } : null,
  };
}

async function stampPxVarianceReason(
  receptionId: string,
  varianceReason: string,
): Promise<void> {
  const supabase = getSupabaseServerClient();
  const trimmed = varianceReason.trim();
  if (!trimmed) return;

  const { data: boxes } = await supabase
    .from('boxes')
    .select('id, declared_quantity, capacity, rack_location')
    .eq('reception_id', receptionId);

  const eligible = (boxes ?? []).filter(
    (b) => !['ELIMINADO', 'DESPACHO'].includes(b.rack_location ?? 'PX_CAPTURA'),
  );
  const boxIds = eligible.map((b) => b.id);
  let activeCount = 0;
  if (boxIds.length > 0) {
    const { count } = await supabase
      .from('px_reception_equipment')
      .select('id', { count: 'exact', head: true })
      .eq('reception_id', receptionId)
      .eq('capture_status', 'active')
      .in('box_id', boxIds);
    activeCount = count ?? 0;
  }

  const expected = eligible.reduce(
    (acc, b) => acc + (b.declared_quantity ?? b.capacity ?? 0),
    0,
  );
  const variance = Math.max(0, expected - activeCount);

  await supabase
    .from('receptions')
    .update({
      variance_reason: trimmed,
      variance_units: variance > 0 ? variance : null,
      expected_units: expected,
    })
    .eq('id', receptionId);
}

async function loadPxReceptionFinalizeSummary(receptionId: string): Promise<{
  reception_id: string;
  guide_number: string;
  status: string;
  received_units: number;
  expected_units: number;
  is_partial: boolean;
  already_finalized?: boolean;
}> {
  const supabase = getSupabaseServerClient();
  const { data: rec, error } = await supabase
    .from('receptions')
    .select(
      'id, guide_number, status, received_units, expected_units, variance_units, variance_reason',
    )
    .eq('id', receptionId)
    .single();

  if (error || !rec) {
    throw new Error(error?.message ?? 'Recepción no encontrada tras finalizar');
  }

  const isPartial =
    (rec.variance_units ?? 0) > 0 ||
    Boolean(rec.variance_reason?.trim());

  return {
    reception_id: rec.id,
    guide_number: rec.guide_number ?? '',
    status: rec.status ?? '',
    received_units: rec.received_units ?? 0,
    expected_units: rec.expected_units ?? 0,
    is_partial: isPartial,
    already_finalized: rec.status === 'CLASIFICADA',
  };
}

export type PxFinalizePrepStepData = {
  phase: 'preparing' | 'prepared' | 'done';
  box_code?: string | null;
  boxes_remaining: number;
  already_finalized?: boolean;
  guide_number?: string;
  received_units?: number;
};

export type PxFinalizePromoteStepData = {
  phase: 'promoting' | 'done';
  promoted_this_batch: number;
  remaining_active: number;
  received_units?: number;
  reception_id?: string;
  guide_number?: string;
  status?: string;
  expected_units?: number;
  is_partial?: boolean;
  already_finalized?: boolean;
};

async function stampPxVarianceReasonIfNeeded(
  receptionId: string,
  varianceReason?: string | null,
): Promise<void> {
  if (!varianceReason?.trim()) return;
  const supabase = getSupabaseServerClient();
  const { data: rec } = await supabase
    .from('receptions')
    .select('variance_reason')
    .eq('id', receptionId)
    .maybeSingle();
  if (rec?.variance_reason?.trim()) return;
  await stampPxVarianceReason(receptionId, varianceReason);
}

async function emitPxFinalizeComplete(
  receptionId: string,
  payload: {
    reception_id: string;
    guide_number: string;
    status: string;
    received_units: number;
    expected_units: number;
    is_partial: boolean;
    batches?: { prep: number; promote: number };
  },
  durationMs: number,
): Promise<void> {
  await emitPxDomainEvent(
    payload.is_partial ? 'ReceptionPartiallyCompleted' : 'ReceptionCompleted',
    receptionId,
    payload as Record<string, unknown>,
  );
  await emitPxCaptureMetric({
    receptionId,
    action: 'finalize_px_reception',
    outcome: 'success',
    durationMs,
    metadata: payload as Record<string, unknown>,
  });
}

/** Un paso de prep: asigna BOX-xxx a una caja cerrada en PX. */
export async function finalizePxReceptionPrepStep(input: {
  receptionId: string;
  expectedVersion: number;
}): Promise<
  | { success: true; data: PxFinalizePrepStepData }
  | { success: false; error: string }
> {
  const { data, error } = await callPxFinalizeRpc('finalize_px_reception_prep_one_box_tx', [
    input.receptionId,
    input.expectedVersion,
  ]);

  if (error) {
    return { success: false, error: mapRpcCaptureError(error.message) };
  }

  if (data?.already_finalized || data?.phase === 'done') {
    const summary = await loadPxReceptionFinalizeSummary(input.receptionId);
    return {
      success: true,
      data: {
        phase: 'done',
        boxes_remaining: 0,
        already_finalized: true,
        guide_number: summary.guide_number,
        received_units: summary.received_units,
      },
    };
  }

  const boxesRemaining = (data?.boxes_remaining as number | undefined) ?? 0;
  const phase =
    data?.phase === 'prepared' || boxesRemaining === 0 ? 'prepared' : 'preparing';

  return {
    success: true,
    data: {
      phase,
      box_code: (data?.box_code as string | null | undefined) ?? null,
      boxes_remaining: boxesRemaining,
    },
  };
}

/** Un paso de promote: ingresa un lote de equipos a inventario/OS. */
export async function finalizePxReceptionPromoteStep(input: {
  receptionId: string;
  expectedVersion: number;
  varianceReason?: string;
  operatorId?: string | null;
  operatorName?: string;
  stampVariance?: boolean;
}): Promise<
  | { success: true; data: PxFinalizePromoteStepData }
  | { success: false; error: string }
> {
  if (input.stampVariance !== false) {
    await stampPxVarianceReasonIfNeeded(input.receptionId, input.varianceReason);
  }

  const batchSize = getPxFinalizePromoteBatchSize();
  const varianceReason = input.varianceReason?.trim() || null;
  const { data, error } = await callPxFinalizeRpc('finalize_px_reception_batch_tx', [
    input.receptionId,
    input.expectedVersion,
    varianceReason,
    input.operatorId || null,
    input.operatorName || 'OPERADOR',
    batchSize,
  ]);

  if (error) {
    return { success: false, error: mapRpcCaptureError(error.message) };
  }

  const remaining = (data?.remaining_active as number | undefined) ?? 0;
  const promoted = (data?.promoted_this_batch as number | undefined) ?? 0;

  if (data?.phase === 'done') {
    const summary = await loadPxReceptionFinalizeSummary(input.receptionId);
    return {
      success: true,
      data: {
        ...summary,
        phase: 'done',
        promoted_this_batch: promoted,
        remaining_active: 0,
        received_units: (data?.received_units as number | undefined) ?? summary.received_units,
      },
    };
  }

  return {
    success: true,
    data: {
      phase: 'promoting',
      promoted_this_batch: promoted,
      remaining_active: remaining,
    },
  };
}

/**
 * Finaliza PX por lotes: prep 1 caja/RPC + promote equipos en chunks (evita timeout monolítico).
 */
export async function finalizePxReceptionInBatches(input: {
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
        batches?: { prep: number; promote: number };
      };
    }
  | { success: false; error: string }
> {
  const started = Date.now();
  const varianceReason = input.varianceReason?.trim() || null;
  const operatorId = input.operatorId || null;
  const operatorName = input.operatorName || 'OPERADOR';
  let prepIterations = 0;
  let promoteBatches = 0;

  for (let i = 1; i <= BATCH_LIMITS.PX_FINALIZE_PREP_MAX_ITERATIONS; i += 1) {
    prepIterations = i;
    const prep = await finalizePxReceptionPrepStep({
      receptionId: input.receptionId,
      expectedVersion: input.expectedVersion,
    });

    if (!prep.success) {
      await emitPxCaptureMetric({
        receptionId: input.receptionId,
        action: 'finalize_px_reception',
        outcome: 'error',
        errorCode: 'PREP_ERROR',
        durationMs: Date.now() - started,
        metadata: { phase: 'prep', iteration: i, message: prep.error },
      });
      return prep;
    }

    if (prep.data.already_finalized || prep.data.phase === 'done') {
      const summary = await loadPxReceptionFinalizeSummary(input.receptionId);
      return {
        success: true,
        data: { ...summary, already_finalized: true, batches: { prep: 0, promote: 0 } },
      };
    }

    if (prep.data.phase === 'prepared') break;
  }

  let lastPromote: PxFinalizePromoteStepData | null = null;
  for (let i = 1; i <= BATCH_LIMITS.PX_FINALIZE_PROMOTE_MAX_ITERATIONS; i += 1) {
    promoteBatches = i;
    const promote = await finalizePxReceptionPromoteStep({
      receptionId: input.receptionId,
      expectedVersion: input.expectedVersion,
      varianceReason: varianceReason ?? undefined,
      operatorId,
      operatorName,
      stampVariance: i === 1,
    });

    if (!promote.success) {
      await emitPxCaptureMetric({
        receptionId: input.receptionId,
        action: 'finalize_px_reception',
        outcome: 'error',
        errorCode: 'PROMOTE_ERROR',
        durationMs: Date.now() - started,
        metadata: { phase: 'promote', batch: i, prepIterations, message: promote.error },
      });
      return promote;
    }

    lastPromote = promote.data;
    if (promote.data.phase === 'done') break;
  }

  if (lastPromote?.phase !== 'done') {
    const remaining = lastPromote?.remaining_active ?? '?';
    await emitPxCaptureMetric({
      receptionId: input.receptionId,
      action: 'finalize_px_reception',
      outcome: 'error',
      errorCode: 'PROMOTE_INCOMPLETE',
      durationMs: Date.now() - started,
      metadata: { prepIterations, promoteBatches, remaining },
    });
    return {
      success: false,
      error: `Finalización incompleta: quedan ${remaining} equipos activos. Reintente finalizar.`,
    };
  }

  const summary = await loadPxReceptionFinalizeSummary(input.receptionId);
  const payload = {
    ...summary,
    received_units: lastPromote.received_units ?? summary.received_units,
    batches: { prep: prepIterations, promote: promoteBatches },
  };

  await emitPxFinalizeComplete(input.receptionId, payload, Date.now() - started);

  return { success: true, data: payload };
}

/** Emite eventos de dominio tras el último paso promote (flujo cliente). */
export async function notifyPxReceptionFinalizeComplete(
  receptionId: string,
  receivedUnits?: number,
): Promise<{
  reception_id: string;
  guide_number: string;
  status: string;
  received_units: number;
  expected_units: number;
  is_partial: boolean;
}> {
  const summary = await loadPxReceptionFinalizeSummary(receptionId);
  const payload = {
    ...summary,
    received_units: receivedUnits ?? summary.received_units,
  };
  await emitPxFinalizeComplete(receptionId, payload, 0);
  return payload;
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
        batches?: { prep: number; promote: number };
      };
    }
  | { success: false; error: string }
> {
  const snapshot = await getPxReceptionSnapshot(input.receptionId);
  const zeroAcceptedRejectedBox = snapshot?.boxes.find(
    (box) =>
      box.declared_quantity > 0 &&
      box.captured_count === 0 &&
      box.rejected_count > 0,
  );
  if (zeroAcceptedRejectedBox) {
    return {
      success: false,
      error:
        `No es posible finalizar la recepción. La caja ${zeroAcceptedRejectedBox.box_code} ` +
        `tiene 0 unidades aceptadas y ${zeroAcceptedRejectedBox.rejected_count} rechazadas ` +
        'por existir en otras Órdenes de Servicio abiertas.',
    };
  }
  return finalizePxReceptionInBatches(input);
}
