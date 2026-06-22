import { emitDomainEvent } from '@/lib/database/domainEvents';
import type { IStateTimelineEmitter } from '../../domain/ports/state-timeline-emitter.port';
import type { OperationalStateChangedPayload } from '../../domain/ports/state-timeline-emitter.port';

export const STATE_ENGINE_DOMAIN_EVENTS = {
  OPERATIONAL_STATE_CHANGED: 'os.operational_state.changed',
} as const;

/** SE-1 skeleton — dual-write domain_events; audit detallado en SE-3. */
export class DomainEventsTimelineEmitter implements IStateTimelineEmitter {
  async emitOperationalStateChanged(payload: OperationalStateChangedPayload): Promise<void> {
    await emitDomainEvent({
      eventType: STATE_ENGINE_DOMAIN_EVENTS.OPERATIONAL_STATE_CHANGED,
      aggregateType: 'service_order',
      aggregateId: payload.serviceOrderId,
      correlationId: payload.context?.correlationId ?? payload.serviceOrderId,
      source: 'state_engine',
      actorLabel: payload.context?.actorLabel ?? null,
      payload: {
        from_state: payload.fromState,
        to_state: payload.toState,
        reason: payload.context?.reason ?? null,
      },
    });
  }
}
