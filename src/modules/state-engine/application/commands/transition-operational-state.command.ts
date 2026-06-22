import type { OperationalStateCode } from '../../domain/enums/operational-state-code.enum';
import type { TransitionContext } from '../../domain/ports/transition-policy.port';

export class TransitionOperationalStateCommand {
  constructor(
    readonly serviceOrderId: string,
    readonly targetState: OperationalStateCode,
    readonly context: TransitionContext = {}
  ) {}
}
