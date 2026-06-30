import type { OperationalStateCode } from '../enums/operational-state-code.enum';
import type { TransitionContext } from './transition-policy.port';

/** Payload del evento de cambio de estado operativo. */
export interface OperationalStateChangedPayload {
  serviceOrderId: string;
  fromState: OperationalStateCode | null;
  toState: OperationalStateCode;
  context?: TransitionContext;
}

/** Puerto de emisión de eventos de dominio al timeline (Motor 3). */
export interface IStateTimelineEmitter {
  emitOperationalStateChanged(payload: OperationalStateChangedPayload): Promise<void>;
}
