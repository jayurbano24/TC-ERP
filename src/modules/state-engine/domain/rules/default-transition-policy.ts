import {
  OPERATIONAL_STATE_LABELS,
  TERMINAL_OPERATIONAL_STATES,
  type OperationalStateCode,
} from '../enums/operational-state-code.enum';
import type {
  ITransitionPolicy,
  TransitionContext,
  TransitionValidationResult,
} from '../ports/transition-policy.port';

const TERMINAL = new Set<OperationalStateCode>(TERMINAL_OPERATIONAL_STATES);

/**
 * Política de transición por defecto del snapshot operativo (Motor 2).
 *
 * El snapshot refleja una única ubicación operativa por OS y, mientras dure el
 * strangler, el motor legado (RPC `refresh_service_order_operational_states`)
 * puede recolocar una OS en cualquier bucket. Por eso la política es
 * deliberadamente permisiva, con dos invariantes:
 *
 *  1. Re-afirmar el mismo estado siempre se permite (idempotente).
 *  2. No se permite salir de un estado terminal (despachado / scrap / devuelto)
 *     hacia otro estado distinto: una OS cerrada no vuelve al pipeline.
 */
export class DefaultTransitionPolicy implements ITransitionPolicy {
  validate(
    from: OperationalStateCode | null,
    to: OperationalStateCode,
    _context: TransitionContext
  ): TransitionValidationResult {
    if (from === to) return { allowed: true };

    if (from && TERMINAL.has(from)) {
      return {
        allowed: false,
        reason: `La OS está en un estado terminal (${OPERATIONAL_STATE_LABELS[from]}) y no puede transicionar a ${OPERATIONAL_STATE_LABELS[to]}.`,
      };
    }

    return { allowed: true };
  }
}
