import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { fetchProfileDisplayNames } from '@/lib/api/profileDisplayNames';

export type TraceabilityEvent = {
  id: string;
  changed_at: string;
  action: string;
  status: string;
  module: string;
  comment: string;
  actorName: string;
  source: 'audit' | 'domain' | 'timeline' | 'warehouse';
};

/** Normaliza tokens de alcance (series, SAP, OS, guía) para matching. */
function normalizeScopeToken(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function buildScopeTokens(values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const v of values) {
    const t = normalizeScopeToken(v || '');
    if (t.length >= 4) out.push(t);
  }
  return [...new Set(out)];
}

function textMentionsAnyToken(text: string, tokens: string[]): boolean {
  if (!tokens.length) return false;
  const u = normalizeScopeToken(text);
  if (!u) return false;
  return tokens.some((t) => u.includes(t));
}

/**
 * Ruido de recepción/lote que NO es movimiento de esta OS/serie:
 * lotes clasificados, fotos, status genéricos, otras categorías, etc.
 */
function isReceptionBatchNoise(action: string, comment: string, status: string): boolean {
  const blob = `${action} ${comment} ${status}`.toUpperCase();
  if (/\bPHOTOS?:?\b/.test(blob) && !blob.includes('EQUIPO')) return true;
  if (action.trim().toUpperCase() === 'STATUS' && blob.includes('RECIBIDO_BACKOFFICE')) {
    return true;
  }
  if (blob.includes('LOTE CLASIFICADO')) return true;
  if (
    blob.includes('EQUIPMENT.BATCH') ||
    blob.includes('BATCH_CLASSIFIED') ||
    blob.includes('BATCH CLASSIFIED') ||
    blob.includes('CLASSIFY BATCH') ||
    blob.includes('CLASSIFY_BATCH')
  ) {
    return true;
  }
  // Movimientos de otras categorías del mismo lote de recepción.
  if (/MOVIDO A BODEGA:\s*(TEL[EÉ]FONO|ACCESORIO)/i.test(blob)) return true;
  return false;
}

function payloadMentionsScope(
  payload: Record<string, unknown> | null | undefined,
  scope: {
    serviceOrderId?: string | null;
    sapTransferId?: string | null;
    sapDocumentNumber?: string | null;
    serials: string[];
    guideTokens: string[];
  }
): boolean {
  if (!payload || typeof payload !== 'object') return false;

  const so = payload.service_order_id;
  if (scope.serviceOrderId && typeof so === 'string' && so === scope.serviceOrderId) {
    return true;
  }
  const sapId = payload.sap_transfer_id;
  if (scope.sapTransferId && typeof sapId === 'string' && sapId === scope.sapTransferId) {
    return true;
  }
  const sapDoc =
    (typeof payload.sap_document_number === 'string' && payload.sap_document_number) ||
    (typeof payload.document_number === 'string' && payload.document_number) ||
    '';
  if (
    scope.sapDocumentNumber &&
    normalizeScopeToken(sapDoc) === normalizeScopeToken(scope.sapDocumentNumber)
  ) {
    return true;
  }

  const serialCandidates = [
    payload.main_serial,
    payload.serial_number,
    payload.serial,
    payload.s1,
    payload.s2,
  ];
  for (const c of serialCandidates) {
    if (typeof c === 'string' && scope.serials.includes(normalizeScopeToken(c))) {
      return true;
    }
  }
  const serialsArr = payload.serial_numbers;
  if (Array.isArray(serialsArr)) {
    for (const s of serialsArr) {
      if (typeof s === 'string' && scope.serials.includes(normalizeScopeToken(s))) {
        return true;
      }
    }
  }
  const seriesIds = payload.series_ids;
  if (Array.isArray(seriesIds) && seriesIds.some((id) => typeof id === 'string' && id)) {
    // series UUID match handled by caller via record_id queries; skip here
  }

  const guide =
    (typeof payload.guide_number === 'string' && payload.guide_number) ||
    (typeof payload.guide === 'string' && payload.guide) ||
    '';
  if (guide && textMentionsAnyToken(guide, scope.guideTokens)) return true;

  return false;
}

/** Evento genérico de arranque de recepción (una sola vez por equipo). */
function isGenericReceptionStart(action: string, comment: string): boolean {
  const blob = `${action} ${comment}`.toUpperCase();
  if (blob.includes('INGRESO INICIAL')) return true;
  if (blob.includes('RECEPCIÓN CAC') || blob.includes('RECEPCION CAC')) return true;
  if (action.includes('RECEPCIONADA') || action.includes('RECEPCIÓN')) return true;
  if (action.includes('MOV-START') || action.includes('RECEPTION.STARTED')) return true;
  return false;
}

/**
 * ¿Este evento de recepción/lote aplica a la OS/serie consultada?
 * Los eventos ya amarrados por record_id (series/OS/caja/SAP) se marcan scoped=true.
 */
function isEquipmentScopedEvent(
  event: Pick<TraceabilityEvent, 'action' | 'comment' | 'status'>,
  opts: {
    alreadyScoped: boolean;
    payload?: Record<string, unknown> | null;
    scopeTokens: string[];
    sapTokens: string[];
    guideTokens: string[];
    serials: string[];
    serviceOrderId?: string | null;
    sapTransferId?: string | null;
    sapDocumentNumber?: string | null;
    allowGenericReception: boolean;
  }
): boolean {
  const { action, comment, status } = event;
  if (isReceptionBatchNoise(action, comment, status)) return false;

  if (opts.alreadyScoped) return true;

  const blob = `${action} ${comment} ${status}`;
  if (textMentionsAnyToken(blob, opts.scopeTokens)) return true;

  if (
    payloadMentionsScope(opts.payload, {
      serviceOrderId: opts.serviceOrderId,
      sapTransferId: opts.sapTransferId,
      sapDocumentNumber: opts.sapDocumentNumber,
      serials: opts.serials,
      guideTokens: opts.guideTokens,
    })
  ) {
    return true;
  }

  // Documentos SAP / transfers: solo el de esta OS.
  const looksLikeSapDoc =
    blob.toUpperCase().includes('DOCUMENTO SAP') ||
    blob.toUpperCase().includes('SAP TRANSFER') ||
    blob.toUpperCase().includes('CAC.SAP') ||
    action.toUpperCase().includes('SAP');
  if (looksLikeSapDoc) {
    return textMentionsAnyToken(blob, opts.sapTokens);
  }

  // Clasificación de EQUIPO de esta guía (timeline).
  if (/MOVIDO A BODEGA:\s*EQUIPO/i.test(blob)) {
    if (!opts.guideTokens.length) return true;
    return textMentionsAnyToken(blob, opts.guideTokens);
  }

  if (opts.allowGenericReception && isGenericReceptionStart(action, comment)) {
    return true;
  }

  // SERIES_CLASSIFIED / EQUIPMENT.CLASSIFIED sin token: solo si payload lo amarra.
  const uBlob = blob.toUpperCase();
  if (
    uBlob.includes('SERIES_CLASSIFIED') ||
    uBlob.includes('EQUIPMENT.CLASSIFIED') ||
    uBlob.includes('EQUIPMENT CLASSIFIED')
  ) {
    return Boolean(
      opts.payload &&
        payloadMentionsScope(opts.payload, {
          serviceOrderId: opts.serviceOrderId,
          sapTransferId: opts.sapTransferId,
          sapDocumentNumber: opts.sapDocumentNumber,
          serials: opts.serials,
          guideTokens: opts.guideTokens,
        })
    );
  }

  return false;
}

function isSystemActor(name: string | null | undefined): boolean {
  if (!name) return true;
  const n = name.trim().toUpperCase();
  return n === 'SISTEMA' || n === 'N/A' || n === '---';
}

/** Nombre de quien recepcionó físicamente (CAC/PX) — guardado en receptions.notes */
export function parseReceptionReceiverFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/Recibido Por:\s*([^\n]+)/i);
  if (match?.[1]) return formatPersonName(match[1].trim());
  return null;
}

/** Guías escaneadas al recepcionar (línea Guías: en notes) */
export function parseReceptionGuidesFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/Guías:\s*([^\n]+)/i);
  if (match?.[1]) return match[1].trim();
  return null;
}

function pickActorName(...candidates: (string | null | undefined)[]): string {
  for (const c of candidates) {
    if (c && !isSystemActor(c)) return c;
  }
  return 'N/A';
}

function formatPersonName(raw: string): string {
  const name = raw.split('@')[0].trim();
  if (!name) return '---';
  if (name.includes(' ')) {
    return name
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/** Identifica eventos de captura de equipo (PX) por action/event_type. */
function isCaptureEventKey(s: string | null | undefined): boolean {
  const u = (s || '').toLowerCase();
  return u.includes('equipmentcaptured') || u.includes('equipment.captured');
}

/** Serial principal del equipo en el payload del evento (mayúsculas). */
function eventMainSerial(payload: Record<string, unknown> | null | undefined): string | null {
  const v = payload?.main_serial;
  return typeof v === 'string' && v.trim() ? v.trim().toUpperCase() : null;
}

/** Fase de recepción física (NO clasificación Backoffice). */
function isReceptionPhase(moduleLabel: string, key: string): boolean {
  const k = (key || '').toLowerCase();
  // Clasificación / SAP backoffice nunca se atribuyen al recepcionista.
  if (
    k.includes('clasif') ||
    k.includes('classify') ||
    k.includes('backoffice') ||
    k.includes('sap_transfer') ||
    k.includes('sap.document') ||
    k.includes('guide_completed') ||
    k.includes('reception_classified') ||
    k.includes('series_classified')
  ) {
    return false;
  }
  const m = (moduleLabel || '').toUpperCase();
  if (m === 'PX') return true;
  return (
    k.includes('recep') ||
    k.includes('captur') ||
    k.includes('ingreso') ||
    (m === 'CAC' && (k.includes('recep') || k.includes('mov-start')))
  );
}

/** Quien clasificó en Backoffice (notas timeline), no "Recibido Por". */
export function parseBackofficeClassifierFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const matches = [...notes.matchAll(/CLASIFICACI[ÓO]N[^\n]*Por:\s*([^\n]+)/gi)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1]?.[1]?.trim();
  return last ? formatPersonName(last) : null;
}

/**
 * Traduce eventos ruidosos de PX (EquipmentCaptured / ReceptionStarted /
 * ReceptionCompleted) a un estado canónico + comentario legible y específico del
 * equipo. Devuelve null para eventos que deben conservar su formato original.
 */
function describePxEvent(
  key: string,
  payload: Record<string, unknown>
): { status: string; comment: string } | null {
  const k = (key || '').toLowerCase();
  if (isCaptureEventKey(k)) {
    const serial = eventMainSerial(payload);
    return {
      status: 'EQUIPO_CAPTURADO',
      comment: serial ? `Equipo capturado · S/N ${serial}` : 'Equipo capturado',
    };
  }
  if (k.includes('reception.completed') || k === 'receptioncompleted') {
    const recv = payload?.received_units;
    const exp = payload?.expected_units;
    const guide = payload?.guide_number;
    const parts = ['Recepción finalizada'];
    if (typeof recv === 'number') parts.push(`${recv}${typeof exp === 'number' ? '/' + exp : ''} u`);
    if (typeof guide === 'string' && guide) parts.push(`Guía ${guide}`);
    return { status: 'CLASIFICADA', comment: parts.join(' · ') };
  }
  if (k.includes('reception.started') || k === 'receptionstarted') {
    return { status: 'RECEPCION_INICIADA', comment: 'Recepción iniciada' };
  }
  return null;
}

export function resolveTraceabilityStatusLabel(status: string): string {
  if (!status) return 'DESCONOCIDO';
  switch (status) {
    case 'EQUIPO_CAPTURADO':
    case 'EquipmentCaptured':
      return 'Capturado en Recepción';
    case 'RECEPCION_INICIADA':
    case 'ReceptionStarted':
      return 'Recepción Iniciada';
    case 'CLASIFICADA':
      return 'Clasificada';
    case 'in_central_warehouse':
      return 'Ingresado a Bodega General';
    case 'RECEPCIONADO_BODEGA_GENERAL':
      return 'Ingresado a Backoffice';
    case 'in_workshop':
      return 'Taller (Diagnóstico)';
    case 'in_refurbish':
      return 'Taller (Reacondicionamiento)';
    case 'in_repair':
      return 'Taller (Reparación)';
    case 'in_l3':
      return 'Taller (Nivel 3)';
    case 'in_qc':
      return 'Taller (Reparación)';
    case 'in_validation':
      return 'Taller (Control de Calidad)';
    case 'ready_to_dispatch':
      return 'Taller (Reacondicionado)';
    case 'in_control_warehouse':
      return 'Taller (L3 Avanzado)';
    case 'scrap':
    case 'irreparable':
      return 'SCRAP';
    case 'dispatched':
      return 'Despachado';
    case 'returned':
      return 'Devuelto';
    default:
      return status.replace(/_/g, ' ');
  }
}

function extractActorFromPayload(payload: Record<string, unknown> | null | undefined): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const keys = [
    'operator_name',
    'registered_by',
    'classified_by',
    'registeredBy',
    'classifiedBy',
    'operator_name',
    'received_by',
  ];
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return formatPersonName(value);
  }
  return null;
}

function auditActionToStatus(action: string, payload: Record<string, unknown> | null | undefined): string {
  const status = payload?.status;
  if (typeof status === 'string' && status.trim()) return status;
  return action;
}

function domainEventToStatus(eventType: string, payload: Record<string, unknown>): string {
  const status = payload?.status;
  if (typeof status === 'string' && status.trim()) return status;
  if (eventType.includes('series.classified')) return 'RECEPCIONADO_BODEGA_GENERAL';
  if (eventType.includes('reception.classified')) return 'CLASIFICADA';
  if (eventType.includes('guide.completed')) return 'RECEPCIONADO_BODEGA_GENERAL';
  return eventType;
}

function domainEventToModule(source: string): string {
  if (source === 'cac_backoffice') return 'CAC';
  if (source === 'px_reception') return 'PX';
  if (source === 'logistics') return 'Logística';
  return 'Casa Matriz';
}

function parseTimelineFromNotes(notes: string): TraceabilityEvent[] {
  if (!notes) return [];

  let timelinePart = '';
  if (notes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')) {
    timelinePart = notes.split('--- LÍNEA DE TIEMPO (MATRIZ) ---').pop() || '';
  } else if (notes.includes('--- LÍNEA DE TIEMPO ---')) {
    timelinePart = notes.split('--- LÍNEA DE TIEMPO ---').pop() || '';
  } else {
    return [];
  }

  const events: TraceabilityEvent[] = [];
  let lastKnownTime = '';

  for (const line of timelinePart.split('\n')) {
    const event = line.trim();
    if (!event) continue;
    if (event.includes('---') || event.toUpperCase().includes('GUÍAS PROCESADAS')) continue;

    let cleanTime = '';
    let content = event;

    if (event.includes('] ')) {
      const [timeStr, ...rest] = event.split('] ');
      cleanTime = (timeStr || '').replace('[', '').trim();
      lastKnownTime = cleanTime;
      content = rest.join('] ').trim();
    } else {
      cleanTime = lastKnownTime;
    }

    const porMatch = content.match(/- Por:\s*(.+)$/i);
    const actorName = porMatch?.[1] ? formatPersonName(porMatch[1]) : 'SISTEMA';
    const body = porMatch ? content.replace(/- Por:\s*.+$/i, '').trim() : content;

    let action = body;
    let comment = body;
    const colonIdx = body.indexOf(': ');
    if (colonIdx > 0) {
      action = body.slice(0, colonIdx).trim();
      comment = body.slice(colonIdx + 2).trim();
    }

    const parsedDate = cleanTime ? tryParseTimelineDate(cleanTime) : null;

    events.push({
      id: `timeline-${events.length}-${parsedDate || cleanTime}`,
      changed_at: parsedDate || new Date().toISOString(),
      action: action.toUpperCase(),
      status: inferStatusFromTimelineAction(action, comment),
      module: content.toUpperCase().includes('BACKOFFICE') ? 'CAC' : 'CAC',
      comment,
      actorName,
      source: 'timeline',
    });
  }

  return events;
}

function tryParseTimelineDate(raw: string): string | null {
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, d, mo, y, h = '0', mi = '0', s = '0'] = m;
  const date = new Date(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(s)
  );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inferStatusFromTimelineAction(action: string, comment: string): string {
  const text = `${action} ${comment}`.toUpperCase();
  if (text.includes('CLASIFICACIÓN') || text.includes('CLASSIFY')) return 'RECEPCIONADO_BODEGA_GENERAL';
  if (text.includes('INGRESO BODEGA') || text.includes('BODEGA CENTRAL')) return 'in_central_warehouse';
  if (text.includes('RECEPCIÓN')) return 'RECEPCIONADA';
  if (text.includes('DEVOLUCI')) return 'returned';
  if (text.includes('DESPACHO')) return 'dispatched';
  return action;
}

async function resolveProfileNames(
  _supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  userIds: string[]
): Promise<Record<string, string>> {
  if (!userIds.length) return {};
  try {
    return await fetchProfileDisplayNames(userIds);
  } catch {
    return {};
  }
}

export async function getEquipmentTraceabilityHistory(params: {
  seriesIds: string[];
  serviceOrderId?: string | null;
  receptionId?: string | null;
  sapTransferId?: string | null;
  boxId?: string | null;
  /** Guías / SAP de ESTA OS (no todas las del lote de recepción). */
  guideNumbers?: string[];
  /** Documento SAP canónico de la OS (p. ej. 416223649-2). */
  sapDocumentNumber?: string | null;
  /** Etiqueta OS (p. ej. TC-17823). */
  osLabel?: string | null;
  receptionNotes?: string | null;
  /** Seriales del equipo consultado; filtra capturas de otros equipos de la misma recepción/caja. */
  equipmentSerials?: string[];
}): Promise<TraceabilityEvent[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const equipmentSerials = (params.equipmentSerials || [])
    .map((s) => normalizeScopeToken(s))
    .filter(Boolean);
  const serialFilter = new Set(equipmentSerials);

  const guideTokens = buildScopeTokens(params.guideNumbers || []);
  const sapTokens = buildScopeTokens([
    params.sapDocumentNumber,
    ...(params.guideNumbers || []),
  ]);
  const scopeTokens = buildScopeTokens([
    ...equipmentSerials,
    params.osLabel,
    params.sapDocumentNumber,
    params.serviceOrderId,
    ...(params.guideNumbers || []),
  ]);

  // IDs amarrados al equipo: series, OS, SAP transfer, caja.
  // NO incluir receptionId aquí: trae todos los lotes SAP del día.
  const scopedRecordIds = new Set<string>();
  for (const id of params.seriesIds) if (id) scopedRecordIds.add(id);
  if (params.serviceOrderId) scopedRecordIds.add(params.serviceOrderId);
  if (params.sapTransferId) scopedRecordIds.add(params.sapTransferId);
  if (params.boxId) scopedRecordIds.add(params.boxId);
  for (const g of params.guideNumbers || []) if (g) scopedRecordIds.add(g);
  if (params.sapDocumentNumber) scopedRecordIds.add(params.sapDocumentNumber);

  const scopedIdList = [...scopedRecordIds];
  const auditPromises: PromiseLike<Array<{ row: any; alreadyScoped: boolean }>>[] = [];

  if (scopedIdList.length) {
    auditPromises.push(
      supabase
        .from('erp_audit_logs')
        .select('id, action, created_at, module, user_id, new_values, observations, record_id')
        .in('record_id', scopedIdList)
        .then(({ data }) =>
          (data || []).map((row) => ({ row, alreadyScoped: true }))
        )
    );
  }

  // Recepción: solo para capturas PX / eventos con payload que mencione este equipo.
  if (params.receptionId) {
    auditPromises.push(
      supabase
        .from('erp_audit_logs')
        .select('id, action, created_at, module, user_id, new_values, observations, record_id')
        .filter('new_values->>reception_id', 'eq', params.receptionId)
        .then(({ data }) =>
          (data || []).map((row) => ({ row, alreadyScoped: false }))
        )
    );
  }

  if (params.sapTransferId) {
    auditPromises.push(
      supabase
        .from('erp_audit_logs')
        .select('id, action, created_at, module, user_id, new_values, observations, record_id')
        .filter('new_values->>sap_transfer_id', 'eq', params.sapTransferId)
        .then(({ data }) =>
          (data || []).map((row) => ({ row, alreadyScoped: true }))
        )
    );
  }

  const aggregateIds = [
    ...params.seriesIds,
    params.serviceOrderId,
    params.sapTransferId,
    params.sapDocumentNumber,
    ...(params.guideNumbers || []),
  ]
    .filter(Boolean)
    .map(String);

  const domainPromise =
    aggregateIds.length > 0
      ? supabase
          .from('domain_events')
          .select(
            'id, occurred_at, event_type, source, actor_id, actor_label, payload, correlation_id, aggregate_id'
          )
          .in('aggregate_id', aggregateIds)
          .then(({ data }) =>
            (data || []).map((row) => ({ row, alreadyScoped: true }))
          )
      : Promise.resolve([] as Array<{ row: any; alreadyScoped: boolean }>);

  // Correlación por recepción: ruido de lotes; filtrar después por alcance.
  const correlationPromise = params.receptionId
    ? supabase
        .from('domain_events')
        .select(
          'id, occurred_at, event_type, source, actor_id, actor_label, payload, correlation_id, aggregate_id'
        )
        .eq('correlation_id', params.receptionId)
        .then(({ data }) =>
          (data || []).map((row) => ({ row, alreadyScoped: false }))
        )
    : Promise.resolve([] as Array<{ row: any; alreadyScoped: boolean }>);

  const warehousePromise =
    params.seriesIds.length > 0 || params.boxId
      ? (async () => {
          const rows: any[] = [];
          const movSelect =
            'id, created_at, movement_type, box_id, box_code, series_ids, performed_by, performed_by_name, notes, guide_number, target_location';
          if (params.boxId) {
            const { data } = await supabase
              .from('warehouse_movements')
              .select(movSelect)
              .eq('box_id', params.boxId)
              .order('created_at', { ascending: true })
              .limit(80);
            rows.push(...(data || []));
          }
          // Movimientos que listan alguna serie del equipo (sin depender solo de caja actual).
          if (params.seriesIds.length > 0) {
            const { data } = await supabase
              .from('warehouse_movements')
              .select(movSelect)
              .overlaps('series_ids', params.seriesIds)
              .order('created_at', { ascending: true })
              .limit(80);
            rows.push(...(data || []));
          }
          const byId = new Map<string, any>();
          for (const r of rows) byId.set(r.id, r);
          return [...byId.values()];
        })()
      : Promise.resolve([] as any[]);

  const boxCodePromise = params.boxId
    ? supabase
        .from('boxes')
        .select('box_code')
        .eq('id', params.boxId)
        .maybeSingle()
        .then(({ data }) =>
          data && typeof (data as { box_code?: string }).box_code === 'string'
            ? String((data as { box_code: string }).box_code)
            : null
        )
    : Promise.resolve(null as string | null);

  const [auditChunks, domainByAggregate, domainByCorrelation, warehouseRows, boxCode] =
    await Promise.all([
      Promise.all(auditPromises),
      domainPromise,
      correlationPromise,
      warehousePromise,
      boxCodePromise,
    ]);

  const auditRows = new Map<string, { row: any; alreadyScoped: boolean }>();
  for (const chunk of auditChunks) {
    for (const item of chunk) {
      const prev = auditRows.get(item.row.id);
      if (!prev || item.alreadyScoped) auditRows.set(item.row.id, item);
    }
  }

  const domainRows = new Map<string, { row: any; alreadyScoped: boolean }>();
  for (const item of [...domainByAggregate, ...domainByCorrelation]) {
    const prev = domainRows.get(item.row.id);
    if (!prev || item.alreadyScoped) domainRows.set(item.row.id, item);
  }

  const userIds = [
    ...[...auditRows.values()].map((r) => r.row.user_id),
    ...[...domainRows.values()].map((r) => r.row.actor_id),
    ...warehouseRows.map((r) => r.performed_by),
  ].filter(Boolean) as string[];

  const profileNames = await resolveProfileNames(supabase, [...new Set(userIds)]);

  const merged: TraceabilityEvent[] = [];
  const receiverFallback = parseReceptionReceiverFromNotes(params.receptionNotes);

  let keptGenericReception = false;

  for (const { row, alreadyScoped } of auditRows.values()) {
    const payload = (row.new_values || {}) as Record<string, unknown>;

    if (isCaptureEventKey(row.action) && serialFilter.size) {
      const serial = eventMainSerial(payload);
      if (serial && !serialFilter.has(serial)) continue;
    }

    const px = describePxEvent(row.action, payload);
    const moduleLabel = mapAuditModule(row.module, payload);
    let actorName =
      (row.user_id && profileNames[row.user_id]) ||
      extractActorFromPayload(payload) ||
      'SISTEMA';
    if (actorName === 'SISTEMA' && receiverFallback && isReceptionPhase(moduleLabel, row.action)) {
      actorName = receiverFallback;
    }

    let auditComment = px?.comment || row.observations || row.action;
    const actionUpper = String(row.action || '').toUpperCase();
    if (
      (actionUpper.includes('DESPACH') || actionUpper.includes('SALIDA')) &&
      typeof payload.guide_number === 'string' &&
      payload.guide_number.trim()
    ) {
      const g = payload.guide_number.trim();
      if (!String(auditComment).includes(g)) {
        auditComment = `Conduce ${g}${auditComment ? ` · ${auditComment}` : ''}`;
      }
    }

    const candidate: TraceabilityEvent = {
      id: `audit-${row.id}`,
      changed_at: row.created_at,
      action: row.action,
      status: px?.status || auditActionToStatus(row.action, payload),
      module: moduleLabel,
      comment: auditComment,
      actorName,
      source: 'audit',
    };

    const allowGeneric = !keptGenericReception;
    if (
      !isEquipmentScopedEvent(candidate, {
        alreadyScoped,
        payload,
        scopeTokens,
        sapTokens,
        guideTokens,
        serials: equipmentSerials,
        serviceOrderId: params.serviceOrderId,
        sapTransferId: params.sapTransferId,
        sapDocumentNumber: params.sapDocumentNumber,
        allowGenericReception: allowGeneric,
      })
    ) {
      continue;
    }
    if (
      !alreadyScoped &&
      isGenericReceptionStart(candidate.action, candidate.comment)
    ) {
      keptGenericReception = true;
    }
    merged.push(candidate);
  }

  for (const { row, alreadyScoped } of domainRows.values()) {
    const payload = (row.payload || {}) as Record<string, unknown>;
    const key =
      row.event_type ||
      (typeof payload.audit_action === 'string' ? payload.audit_action : '');

    const isCapture = isCaptureEventKey(key) || isCaptureEventKey(payload.audit_action as string);
    if (isCapture && serialFilter.size) {
      const serial = eventMainSerial(payload);
      if (serial && !serialFilter.has(serial)) continue;
    }

    const px = describePxEvent(key, payload);
    const moduleLabel = domainEventToModule(row.source);
    let actorName =
      (row.actor_label && formatPersonName(String(row.actor_label))) ||
      (row.actor_id && profileNames[row.actor_id]) ||
      extractActorFromPayload(payload) ||
      'SISTEMA';
    if (actorName === 'SISTEMA' && receiverFallback && isReceptionPhase(moduleLabel, key)) {
      actorName = receiverFallback;
    }

    const candidate: TraceabilityEvent = {
      id: `domain-${row.id}`,
      changed_at: row.occurred_at,
      action: row.event_type,
      status: px?.status || domainEventToStatus(row.event_type, payload),
      module: moduleLabel,
      comment:
        px?.comment ||
        (typeof payload.sap_document_number === 'string' && payload.sap_document_number) ||
        row.event_type,
      actorName,
      source: 'domain',
    };

    const allowGeneric = !keptGenericReception;
    if (
      !isEquipmentScopedEvent(candidate, {
        alreadyScoped,
        payload,
        scopeTokens,
        sapTokens,
        guideTokens,
        serials: equipmentSerials,
        serviceOrderId: params.serviceOrderId,
        sapTransferId: params.sapTransferId,
        sapDocumentNumber: params.sapDocumentNumber,
        allowGenericReception: allowGeneric,
      })
    ) {
      continue;
    }
    if (
      !alreadyScoped &&
      isGenericReceptionStart(candidate.action, candidate.comment)
    ) {
      keptGenericReception = true;
    }
    merged.push(candidate);
  }

  // Timeline de notes: solo líneas de esta OS/guía/SAP (no todo el lote).
  for (const event of parseTimelineFromNotes(params.receptionNotes || '')) {
    const allowGeneric = !keptGenericReception;
    if (
      !isEquipmentScopedEvent(event, {
        alreadyScoped: false,
        scopeTokens,
        sapTokens,
        guideTokens,
        serials: equipmentSerials,
        serviceOrderId: params.serviceOrderId,
        sapTransferId: params.sapTransferId,
        sapDocumentNumber: params.sapDocumentNumber,
        allowGenericReception: allowGeneric,
      })
    ) {
      continue;
    }
    if (isGenericReceptionStart(event.action, event.comment)) {
      keptGenericReception = true;
    }
    merged.push(event);
  }

  // Movimientos reales de bodega (INGRESO / TRASLADO / SALIDA) de estas series.
  const seriesIdSet = new Set(params.seriesIds.filter(Boolean));
  for (const mov of warehouseRows) {
    const movSeries: string[] = Array.isArray(mov.series_ids) ? mov.series_ids : [];
    const hasSeriesOverlap = movSeries.some((id) => seriesIdSet.has(id));
    const isCurrentBox = Boolean(params.boxId) && mov.box_id === params.boxId;
    // Series overlap = movimiento real del equipo. Caja actual solo si no lista series ajenas.
    if (!hasSeriesOverlap) {
      if (!(isCurrentBox && movSeries.length === 0)) continue;
    }

    const type = String(mov.movement_type || 'MOVIMIENTO').toUpperCase();
    let status = type;
    let comment =
      (typeof mov.notes === 'string' && mov.notes.trim()) || type;
    if (type === 'INGRESO') {
      status = 'in_central_warehouse';
      const note = typeof mov.notes === 'string' ? mov.notes.trim() : '';
      comment =
        note ||
        (boxCode
          ? `Ingreso a Bodega General · ${boxCode}`
          : 'Ingreso a Bodega General');
    } else if (type === 'TRASLADO' || type === 'DISPERSION_CAJA') {
      status = 'TRASLADO_CAJA';
      comment =
        (typeof mov.notes === 'string' && mov.notes.trim()) ||
        'Traslado / dispersión de caja';
    } else if (type === 'SALIDA') {
      status = 'dispatched';
      const conduce =
        (typeof mov.guide_number === 'string' && mov.guide_number.trim()) ||
        (typeof mov.target_location === 'string' &&
        /^TC-INV-/i.test(mov.target_location.trim())
          ? mov.target_location.trim()
          : '') ||
        '';
      const note = typeof mov.notes === 'string' ? mov.notes.trim() : '';
      const boxLabel =
        (typeof mov.box_code === 'string' && mov.box_code.trim()) || boxCode || '';
      comment = [
        conduce ? `Conduce ${conduce}` : 'Salida de bodega',
        boxLabel ? `Caja ${boxLabel}` : '',
        note && !note.toLowerCase().includes('despacho') ? note : '',
      ]
        .filter(Boolean)
        .join(' · ');
    }

    const actorName =
      (mov.performed_by_name && formatPersonName(String(mov.performed_by_name))) ||
      (mov.performed_by && profileNames[mov.performed_by]) ||
      'SISTEMA';

    merged.push({
      id: `warehouse-${mov.id}`,
      changed_at: mov.created_at,
      action: type === 'INGRESO' ? 'INGRESO BODEGA' : type,
      status,
      module: 'Bodega',
      comment,
      actorName,
      source: 'warehouse',
    });
  }

  merged.sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());

  return dedupeTraceabilityEvents(merged);
}

function mapAuditModule(module: string, payload: Record<string, unknown>): string {
  if (module === 'cac_backoffice') return 'CAC';
  if (module === 'px_reception') return 'PX';
  if (payload?.source === 'px') return 'PX';
  if (payload?.source === 'cac') return 'CAC';
  if (module === 'Trazabilidad') return 'Casa Matriz';
  return module || 'Casa Matriz';
}

function dedupeTraceabilityEvents(events: TraceabilityEvent[]): TraceabilityEvent[] {
  const seen = new Set<string>();
  const out: TraceabilityEvent[] = [];

  for (const event of events) {
    const bucket = Math.floor(new Date(event.changed_at).getTime() / 60_000);
    // Clave por estado+comentario+actor (no por action) para fusionar el mismo
    // evento registrado en audit ('EquipmentCaptured') y domain ('px.equipment.captured').
    const key = `${bucket}|${event.status}|${event.comment}|${event.actorName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(event);
  }

  return out;
}

export type TraceabilityResponsible = {
  receptionName: string;
  receptionDate: string;
  receptionGuideNumber: string;
  backofficeName: string;
  backofficeDate: string;
  warehouseName: string;
  warehouseDate: string;
};

export function resolveTraceabilityResponsibles(
  history: TraceabilityEvent[],
  extras?: {
    receptionNotes?: string | null;
    receptionProfileName?: string | null;
    receptionGuideNumber?: string | null;
    trayReceivedByName?: string | null;
    receptionCreatedAt?: string | null;
    receptionTime?: string | null;
    trayClassifiedAt?: string | null;
    /** PX: el receptor es también quien clasifica e ingresa a bodega (mismo flujo). */
    isPx?: boolean;
  }
): TraceabilityResponsible {
  const findAudit = (pred: (e: TraceabilityEvent) => boolean) => history.find(pred);

  const notesReceiver = parseReceptionReceiverFromNotes(extras?.receptionNotes);
  const notesGuides = parseReceptionGuidesFromNotes(extras?.receptionNotes);

  const receptionEvent = findAudit(
    (e) =>
      e.action.includes('RECEPCIÓN') ||
      e.action.includes('RECEPTION') ||
      e.action.toLowerCase().includes('px.reception')
  );
  const backofficeEvent = findAudit(
    (e) =>
      e.action.includes('CLASSIFY') ||
      e.action.includes('CLASIFIC') ||
      e.action.includes('SERIES_CLASSIFIED') ||
      e.action.includes('GUIDE_COMPLETED') ||
      e.action.includes('RECEPTION_CLASSIFIED') ||
      e.action.includes('cac.series') ||
      e.action.includes('cac.guide') ||
      e.action.includes('cac.reception') ||
      e.comment.toUpperCase().includes('CREADO EN BACKOFFICE') ||
      e.comment.toUpperCase().includes('DOCUMENTO SAP')
  );
  const warehouseEvent = findAudit(
    (e) =>
      e.action.includes('INGRESO BODEGA') ||
      e.action.includes('INGRESO A BODEGA') ||
      e.action.includes('ASIGNACIÓN CAJA') ||
      e.action.includes('in_central_warehouse') ||
      e.comment.toUpperCase().includes('BODEGA CENTRAL')
  );

  const receptionName = pickActorName(
    notesReceiver,
    extras?.receptionProfileName,
    receptionEvent?.actorName
  );
  const receptionDate =
    extras?.receptionTime ||
    extras?.receptionCreatedAt ||
    receptionEvent?.changed_at ||
    '';

  const notesClassifier = parseBackofficeClassifierFromNotes(extras?.receptionNotes);
  const trayClassifier = extras?.trayReceivedByName
    ? formatPersonName(String(extras.trayReceivedByName))
    : null;

  // No usar el recepcionista como "Backoffice" en CAC (solo PX comparte operador).
  const sameAsReception = (name: string | null | undefined) =>
    Boolean(
      name &&
        receptionName !== 'N/A' &&
        name.trim().toLowerCase() === receptionName.trim().toLowerCase()
    );

  const backofficeActorRaw = pickActorName(
    trayClassifier,
    notesClassifier,
    sameAsReception(backofficeEvent?.actorName) ? null : backofficeEvent?.actorName
  );

  // En PX el mismo operario recepciona, clasifica e ingresa a bodega; cuando no hay
  // evento explícito de backoffice/bodega, se atribuye al receptor (en vez de N/A).
  const pxPerson = extras?.isPx ? receptionName : undefined;
  const pxDate = extras?.isPx ? receptionDate : '';

  return {
    receptionName,
    receptionDate,
    receptionGuideNumber:
      extras?.receptionGuideNumber || notesGuides || 'N/A',
    backofficeName: pickActorName(
      backofficeActorRaw !== 'N/A' ? backofficeActorRaw : null,
      pxPerson
    ),
    backofficeDate: extras?.trayClassifiedAt || backofficeEvent?.changed_at || pxDate,
    warehouseName: pickActorName(warehouseEvent?.actorName, pxPerson),
    warehouseDate: warehouseEvent?.changed_at || pxDate,
  };
}

export async function fetchCacTrayContext(serviceOrderId: string) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from('cac_tray_units')
    .select('received_by_name, classified_at, guide_number, agency_name, sap_document_number')
    .eq('service_order_id', serviceOrderId)
    .maybeSingle();

  return data;
}
