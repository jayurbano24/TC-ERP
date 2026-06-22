import type { DomainEventRow } from '@/lib/database/domainEvents';

const EVENT_LABELS: Record<string, string> = {
  'px.reception.started': 'Recepción PX iniciada',
  'px.reception.operator_joined': 'Operador se unió a recepción',
  'px.equipment.captured': 'Equipo capturado',
  'px.reception.completed': 'Recepción PX finalizada',
  'px.reception.partially_completed': 'Recepción PX parcial',
  'cac.sap_transfer.registered': 'Documento SAP registrado',
  'cac.sap_transfer.agency_updated': 'Agencia SAP actualizada',
  'cac.equipment.classified': 'Equipo clasificado',
  'cac.series.classified': 'Serie ingresada',
  'cac.classify.batch_completed': 'Lote clasificado',
  'cac.sap_transfer.block_returned': 'Devolución bloque SAP',
  'cac.guide.completed': 'Guía completada',
  'cac.reception.classified': 'Recepción clasificada',
};

function payloadValues(payload: Record<string, unknown> | undefined) {
  const nested = payload?.new_values;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return payload ?? {};
}

function eventMatchesGuide(event: DomainEventRow, guide: string): boolean {
  const target = guide.trim().toUpperCase();
  if (!target) return true;

  if (event.aggregate_type === 'reception_guide' && event.aggregate_id.toUpperCase() === target) {
    return true;
  }

  const values = payloadValues(event.payload);
  if (typeof values.guide_number === 'string' && values.guide_number.toUpperCase() === target) {
    return true;
  }

  if (Array.isArray(values.processed_guides)) {
    return values.processed_guides.some(
      (item) => typeof item === 'string' && item.toUpperCase() === target
    );
  }

  return false;
}

export function filterDomainEventsByGuide(
  events: DomainEventRow[],
  guide: string | null | undefined
): DomainEventRow[] {
  if (!guide?.trim()) return events;
  return events.filter((event) => eventMatchesGuide(event, guide));
}

export function formatDomainEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType] ?? eventType.replace(/\./g, ' · ');
}

export function formatDomainEventDetail(event: DomainEventRow): string {
  const values = payloadValues(event.payload);
  const parts: string[] = [];

  if (typeof values.guide_number === 'string') parts.push(`Guía ${values.guide_number}`);
  if (typeof values.main_serial === 'string') parts.push(`SN ${values.main_serial}`);
  if (typeof values.sap_document === 'string') parts.push(`SAP ${values.sap_document}`);
  if (typeof values.sap_document_number === 'string') parts.push(`SAP ${values.sap_document_number}`);
  if (typeof values.category === 'string') parts.push(values.category);
  if (typeof values.received_units === 'number' && typeof values.expected_units === 'number') {
    parts.push(`${values.received_units}/${values.expected_units} unidades`);
  }
  if (typeof values.units_classified === 'number') parts.push(`${values.units_classified} equipos`);
  if (typeof values.os_count === 'number' && values.os_count > 0) parts.push(`${values.os_count} OS`);
  if (typeof values.status === 'string' && !parts.length) parts.push(values.status);

  if (event.actor_label) parts.push(`Por: ${event.actor_label}`);

  return parts.join(' · ') || '—';
}

export function domainEventAccent(eventType: string): 'cyan' | 'navy' | 'emerald' | 'amber' | 'slate' {
  if (eventType.startsWith('px.reception.completed') || eventType.startsWith('cac.reception')) {
    return 'emerald';
  }
  if (eventType.startsWith('px.')) return 'cyan';
  if (eventType.startsWith('cac.')) return 'navy';
  if (eventType.includes('returned') || eventType.includes('partially')) return 'amber';
  return 'slate';
}
