import { getSupabaseBrowserClient } from '@/lib/supabase/client';

export type TraceabilityEvent = {
  id: string;
  changed_at: string;
  action: string;
  status: string;
  module: string;
  comment: string;
  actorName: string;
  source: 'audit' | 'domain' | 'timeline';
};

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

export function resolveTraceabilityStatusLabel(status: string): string {
  if (!status) return 'DESCONOCIDO';
  switch (status) {
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
    case 'in_validation':
      return 'Control de Calidad';
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
  supabase: NonNullable<ReturnType<typeof getSupabaseBrowserClient>>,
  userIds: string[]
): Promise<Record<string, string>> {
  if (!userIds.length) return {};

  const { data: profilesData } = await supabase
    .from('profiles')
    .select('id, full_name')
    .in('id', userIds);

  if (!profilesData?.length) return {};

  const emailsToSearch = profilesData.map((p) => p.full_name).filter((n) => n?.includes('@'));
  let empMap: Record<string, string> = {};

  if (emailsToSearch.length) {
    const { data: emps } = await supabase
      .from('employees')
      .select('email, nombre_completo')
      .in('email', emailsToSearch);
    if (emps) {
      empMap = emps.reduce((acc: Record<string, string>, e) => {
        if (e.email && e.nombre_completo) acc[e.email] = e.nombre_completo;
        return acc;
      }, {});
    }
  }

  return profilesData.reduce((acc: Record<string, string>, p) => {
    let name = p.full_name || '';
    if (name.includes('@')) {
      name = empMap[name] || name.split('@')[0];
    }
    acc[p.id] = formatPersonName(name);
    return acc;
  }, {});
}

export async function getEquipmentTraceabilityHistory(params: {
  seriesIds: string[];
  serviceOrderId?: string | null;
  receptionId?: string | null;
  sapTransferId?: string | null;
  boxId?: string | null;
  guideNumbers?: string[];
  receptionNotes?: string | null;
}): Promise<TraceabilityEvent[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const recordIds = new Set<string>();
  for (const id of params.seriesIds) if (id) recordIds.add(id);
  if (params.serviceOrderId) recordIds.add(params.serviceOrderId);
  if (params.receptionId) recordIds.add(params.receptionId);
  if (params.sapTransferId) recordIds.add(params.sapTransferId);
  if (params.boxId) recordIds.add(params.boxId);
  for (const g of params.guideNumbers || []) if (g) recordIds.add(g);

  const idList = [...recordIds];
  const auditPromises: Promise<any[]>[] = [];

  if (idList.length) {
    auditPromises.push(
      supabase
        .from('erp_audit_logs')
        .select('id, action, created_at, module, user_id, new_values, observations')
        .in('record_id', idList)
        .then(({ data }) => data || [])
    );
  }

  if (params.receptionId) {
    auditPromises.push(
      supabase
        .from('erp_audit_logs')
        .select('id, action, created_at, module, user_id, new_values, observations')
        .filter('new_values->>reception_id', 'eq', params.receptionId)
        .then(({ data }) => data || [])
    );
  }

  if (params.sapTransferId) {
    auditPromises.push(
      supabase
        .from('erp_audit_logs')
        .select('id, action, created_at, module, user_id, new_values, observations')
        .filter('new_values->>sap_transfer_id', 'eq', params.sapTransferId)
        .then(({ data }) => data || [])
    );
  }

  const aggregateIds = [
    ...params.seriesIds,
    params.serviceOrderId,
    params.receptionId,
    params.sapTransferId,
    ...(params.guideNumbers || []),
  ]
    .filter(Boolean)
    .map(String);

  const domainPromise =
    aggregateIds.length > 0
      ? supabase
          .from('domain_events')
          .select(
            'id, occurred_at, event_type, source, actor_id, actor_label, payload, correlation_id'
          )
          .in('aggregate_id', aggregateIds)
          .then(({ data }) => data || [])
      : Promise.resolve([]);

  const correlationPromise = params.receptionId
    ? supabase
        .from('domain_events')
        .select(
          'id, occurred_at, event_type, source, actor_id, actor_label, payload, correlation_id'
        )
        .eq('correlation_id', params.receptionId)
        .then(({ data }) => data || [])
    : Promise.resolve([]);

  const [auditChunks, domainByAggregate, domainByCorrelation] = await Promise.all([
    Promise.all(auditPromises),
    domainPromise,
    correlationPromise,
  ]);

  const auditRows = new Map<string, any>();
  for (const chunk of auditChunks) {
    for (const row of chunk) auditRows.set(row.id, row);
  }

  const domainRows = new Map<string, any>();
  for (const row of [...domainByAggregate, ...domainByCorrelation]) {
    domainRows.set(row.id, row);
  }

  const userIds = [
    ...[...auditRows.values()].map((r) => r.user_id),
    ...[...domainRows.values()].map((r) => r.actor_id),
  ].filter(Boolean) as string[];

  const profileNames = await resolveProfileNames(supabase, [...new Set(userIds)]);

  const merged: TraceabilityEvent[] = [];

  for (const row of auditRows.values()) {
    const payload = (row.new_values || {}) as Record<string, unknown>;
    const actorFromPayload = extractActorFromPayload(payload);
    const actorName =
      (row.user_id && profileNames[row.user_id]) ||
      actorFromPayload ||
      'SISTEMA';

    merged.push({
      id: `audit-${row.id}`,
      changed_at: row.created_at,
      action: row.action,
      status: auditActionToStatus(row.action, payload),
      module: mapAuditModule(row.module, payload),
      comment: row.observations || row.action,
      actorName,
      source: 'audit',
    });
  }

  for (const row of domainRows.values()) {
    const payload = (row.payload || {}) as Record<string, unknown>;
    const actorName =
      (row.actor_label && formatPersonName(String(row.actor_label))) ||
      (row.actor_id && profileNames[row.actor_id]) ||
      extractActorFromPayload(payload) ||
      'SISTEMA';

    merged.push({
      id: `domain-${row.id}`,
      changed_at: row.occurred_at,
      action: row.event_type,
      status: domainEventToStatus(row.event_type, payload),
      module: domainEventToModule(row.source),
      comment:
        (typeof payload.sap_document_number === 'string' && payload.sap_document_number) ||
        row.event_type,
      actorName,
      source: 'domain',
    });
  }

  for (const event of parseTimelineFromNotes(params.receptionNotes || '')) {
    merged.push(event);
  }

  merged.sort((a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime());

  return dedupeTraceabilityEvents(merged);
}

function mapAuditModule(module: string, payload: Record<string, unknown>): string {
  if (module === 'cac_backoffice') return 'CAC';
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
    const key = `${bucket}|${event.action}|${event.status}|${event.actorName}`;
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
      e.action.includes('cac.reception')
  );
  const warehouseEvent = findAudit(
    (e) =>
      e.action.includes('INGRESO BODEGA') ||
      e.action.includes('INGRESO A BODEGA') ||
      e.action.includes('ASIGNACIÓN CAJA') ||
      e.action.includes('in_central_warehouse') ||
      e.comment.toUpperCase().includes('BODEGA CENTRAL')
  );

  return {
    receptionName: pickActorName(
      notesReceiver,
      extras?.receptionProfileName,
      receptionEvent?.actorName
    ),
    receptionDate:
      extras?.receptionTime ||
      extras?.receptionCreatedAt ||
      receptionEvent?.changed_at ||
      '',
    receptionGuideNumber:
      extras?.receptionGuideNumber || notesGuides || 'N/A',
    backofficeName: pickActorName(backofficeEvent?.actorName, extras?.trayReceivedByName),
    backofficeDate: backofficeEvent?.changed_at || extras?.trayClassifiedAt || '',
    warehouseName: pickActorName(warehouseEvent?.actorName),
    warehouseDate: warehouseEvent?.changed_at || '',
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
