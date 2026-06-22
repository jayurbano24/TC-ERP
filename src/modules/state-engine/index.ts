export {
  transitionOperationalState,
  getOperationalSnapshot,
  getOsOperationalState,
  refreshOperationalStatesFromLegacy,
} from './factory';

export {
  OPERATIONAL_STATE_CODE,
  OPERATIONAL_STATE_LABELS,
  TERMINAL_OPERATIONAL_STATES,
  isOperationalStateCode,
} from './domain/enums/operational-state-code.enum';

export type { OperationalStateCode } from './domain/enums/operational-state-code.enum';

export type {
  ServiceOrderOperationalState,
  OperationalSnapshot,
  SnapshotKpiBucket,
} from './domain/entities/service-order-operational-state.entity';

export { TransitionOperationalStateHandler } from './application/commands/transition-operational-state.handler';
export { TransitionOperationalStateCommand } from './application/commands/transition-operational-state.command';
export { GetOperationalSnapshotHandler } from './application/queries/get-operational-snapshot.handler';
export { GetOsOperationalStateHandler } from './application/queries/get-os-operational-state.handler';
export { DefaultTransitionPolicy } from './domain/rules/default-transition-policy';

export type { IOperationalStateRepository } from './domain/ports/operational-state.repository.port';
export type { ITransitionPolicy } from './domain/ports/transition-policy.port';
export type { IStateTimelineEmitter } from './domain/ports/state-timeline-emitter.port';

export { STATE_ENGINE_DOMAIN_EVENTS } from './infrastructure/timeline/domain-events-timeline.emitter';
