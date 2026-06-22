import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const DOMAIN_EVENT_SOURCE = {
  CAC_BACKOFFICE: 'cac_backoffice',
  PX_RECEPTION: 'px_reception',
  LOGISTICS: 'logistics',
} as const;

export const CAC_DOMAIN_EVENTS = {
  SAP_TRANSFER_REGISTERED: 'cac.sap_transfer.registered',
  SAP_TRANSFER_AGENCY_UPDATED: 'cac.sap_transfer.agency_updated',
  EQUIPMENT_CLASSIFIED: 'cac.equipment.classified',
  SERIES_CLASSIFIED: 'cac.series.classified',
  CLASSIFY_BATCH_COMPLETED: 'cac.classify.batch_completed',
  SAP_TRANSFER_BLOCK_RETURNED: 'cac.sap_transfer.block_returned',
  GUIDE_COMPLETED: 'cac.guide.completed',
  RECEPTION_CLASSIFIED: 'cac.reception.classified',
} as const;

export const PX_DOMAIN_EVENTS = {
  RECEPTION_STARTED: 'px.reception.started',
  OPERATOR_JOINED: 'px.reception.operator_joined',
  EQUIPMENT_CAPTURED: 'px.equipment.captured',
  RECEPTION_COMPLETED: 'px.reception.completed',
  RECEPTION_PARTIALLY_COMPLETED: 'px.reception.partially_completed',
} as const;

const PX_AUDIT_TO_DOMAIN: Record<
  string,
  { eventType: string; aggregateType: 'reception' | 'px_equipment' }
> = {
  ReceptionStarted: { eventType: PX_DOMAIN_EVENTS.RECEPTION_STARTED, aggregateType: 'reception' },
  OperatorJoinedReception: { eventType: PX_DOMAIN_EVENTS.OPERATOR_JOINED, aggregateType: 'reception' },
  EquipmentCaptured: { eventType: PX_DOMAIN_EVENTS.EQUIPMENT_CAPTURED, aggregateType: 'px_equipment' },
  ReceptionCompleted: { eventType: PX_DOMAIN_EVENTS.RECEPTION_COMPLETED, aggregateType: 'reception' },
  ReceptionPartiallyCompleted: {
    eventType: PX_DOMAIN_EVENTS.RECEPTION_PARTIALLY_COMPLETED,
    aggregateType: 'reception',
  },
};

export type DomainEventRow = {
  id: string;
  occurred_at: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  correlation_id: string | null;
  source: string;
  actor_id: string | null;
  actor_label: string | null;
  payload: Record<string, unknown>;
  audit_log_id: string | null;
};

export function mapPxAuditActionToDomainEvent(
  action: string,
  receptionId: string,
  metadata: Record<string, unknown> = {}
): {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  correlationId: string;
  actorLabel: string | null;
} | null {
  const mapping = PX_AUDIT_TO_DOMAIN[action];
  if (!mapping) return null;

  const equipmentId = metadata.equipment_id;
  const aggregateId =
    mapping.aggregateType === 'px_equipment' && equipmentId
      ? String(equipmentId)
      : receptionId;

  const actorLabel =
    typeof metadata.operator_name === 'string'
      ? metadata.operator_name
      : typeof metadata.registered_by === 'string'
        ? metadata.registered_by
        : null;

  return {
    eventType: mapping.eventType,
    aggregateType: mapping.aggregateType,
    aggregateId,
    correlationId: receptionId,
    actorLabel,
  };
}

async function emitDomainEventWithClient(
  supabase: SupabaseClient,
  params: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload?: Record<string, unknown>;
    correlationId?: string | null;
    source?: string;
    actorLabel?: string | null;
    auditLogId?: string | null;
  }
) {
  const { data, error } = await supabase.rpc('emit_domain_event', {
    p_event_type: params.eventType,
    p_aggregate_type: params.aggregateType,
    p_aggregate_id: params.aggregateId,
    p_payload: params.payload ?? {},
    p_correlation_id: params.correlationId ?? null,
    p_source: params.source ?? DOMAIN_EVENT_SOURCE.CAC_BACKOFFICE,
    p_actor_label: params.actorLabel ?? null,
    p_audit_log_id: params.auditLogId ?? null,
  });

  if (error) {
    console.error('emit_domain_event:', error.message);
    return { error: error.message };
  }

  return { id: data as string };
}

export async function emitDomainEvent(params: {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
  correlationId?: string | null;
  source?: string;
  actorLabel?: string | null;
  auditLogId?: string | null;
}) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };
  return emitDomainEventWithClient(supabase, params);
}

export async function emitDomainEventServer(params: {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload?: Record<string, unknown>;
  correlationId?: string | null;
  source?: string;
  actorLabel?: string | null;
  auditLogId?: string | null;
}) {
  try {
    const supabase = getSupabaseServerClient();
    return emitDomainEventWithClient(supabase, params);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('emitDomainEventServer:', message);
    return { error: message };
  }
}

export async function fetchEntityTimeline(
  aggregateType: string,
  aggregateId: string,
  limit = 50
): Promise<{ data?: DomainEventRow[]; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { data, error } = await supabase.rpc('get_entity_timeline', {
    p_aggregate_type: aggregateType,
    p_aggregate_id: aggregateId,
    p_limit: limit,
  });

  if (error) return { error: error.message };
  return { data: (data ?? []) as DomainEventRow[] };
}

export async function fetchCorrelationTimeline(
  correlationId: string,
  limit = 100
): Promise<{ data?: DomainEventRow[]; error?: string }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { data, error } = await supabase.rpc('get_correlation_timeline', {
    p_correlation_id: correlationId,
    p_limit: limit,
  });

  if (error) return { error: error.message };
  return { data: (data ?? []) as DomainEventRow[] };
}

export async function fetchDomainEventsStats(days = 30) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: 'Supabase not configured' };

  const { data, error } = await supabase.rpc('audit_domain_events_stats', {
    p_days: days,
  });

  if (error) return { error: error.message };

  const payload = data as Record<string, unknown> | Record<string, unknown>[] | null;
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row || typeof row !== 'object') return { error: 'Invalid stats payload' };

  return { data: row as Record<string, unknown> };
}

function toCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type DomainEventsKpiSummary = {
  days: number;
  total: number;
  withAuditLink: number;
  /** All CAC domain events (equipos + SAP/guía/recepción milestones). */
  eventosCac: number;
  /** All PX domain events (equipos + inicio/cierre recepción). */
  eventosPx: number;
  equiposClasificados: number;
  equiposCapturados: number;
  /** CAC + PX equipment units (not event count). */
  equiposTotales: number;
  /** CAC events that are not equipment classification (SAP, guías, recepciones). */
  hitosCac: number;
  byEventType: Record<string, number>;
};

export async function fetchDomainEventsKpiSummary(
  days = 30
): Promise<DomainEventsKpiSummary | null> {
  const result = await fetchDomainEventsStats(days);
  if (result.error || !result.data) return null;

  const raw = result.data;
  const bySource = (raw.by_source ?? {}) as Record<string, unknown>;
  const byEventType = (raw.by_event_type ?? {}) as Record<string, unknown>;
  const equiposClasificados = toCount(byEventType['cac.equipment.classified']);
  const equiposCapturados = toCount(byEventType['px.equipment.captured']);
  const eventosCac = toCount(bySource.cac_backoffice);
  const eventosPx = toCount(bySource.px_reception);

  return {
    days: toCount(raw.days) || days,
    total: toCount(raw.total),
    withAuditLink: toCount(raw.with_audit_link),
    eventosCac,
    eventosPx,
    equiposClasificados,
    equiposCapturados,
    equiposTotales: equiposClasificados + equiposCapturados,
    hitosCac: Math.max(0, eventosCac - equiposClasificados),
    byEventType: Object.fromEntries(
      Object.entries(byEventType).map(([key, value]) => [key, toCount(value)])
    ),
  };
}
