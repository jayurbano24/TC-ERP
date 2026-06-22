import {
  OPERATIONAL_STATE_LABELS,
  type OperationalStateCode,
} from '../../domain/enums/operational-state-code.enum';
import type { ServiceOrderOperationalState } from '../../domain/entities/service-order-operational-state.entity';
import type { IOperationalStateRepository } from '../../domain/ports/operational-state.repository.port';
import type { IStateTimelineEmitter } from '../../domain/ports/state-timeline-emitter.port';
import type { ITransitionPolicy } from '../../domain/ports/transition-policy.port';
import { TransitionOperationalStateCommand } from './transition-operational-state.command';

export type TransitionOperationalStateResult =
  | { ok: true; state: ServiceOrderOperationalState }
  | { ok: false; error: string };

export class TransitionOperationalStateHandler {
  constructor(
    private readonly repository: IOperationalStateRepository,
    private readonly policy: ITransitionPolicy,
    private readonly timeline: IStateTimelineEmitter
  ) {}

  async execute(
    command: TransitionOperationalStateCommand
  ): Promise<TransitionOperationalStateResult> {
    const current = await this.repository.getByServiceOrderId(command.serviceOrderId);
    const from = current?.stateCode ?? null;

    const validation = this.policy.validate(from, command.targetState, command.context);
    if (!validation.allowed) {
      return { ok: false, error: validation.reason };
    }

    const state = await this.repository.upsert({
      serviceOrderId: command.serviceOrderId,
      stateCode: command.targetState,
      stateLabel: OPERATIONAL_STATE_LABELS[command.targetState as OperationalStateCode],
      sourceChannel: current?.sourceChannel,
      seriesStatus: current?.seriesStatus,
      trayActive: current?.trayActive,
      trayExcluded: current?.trayExcluded,
    });

    await this.timeline.emitOperationalStateChanged({
      serviceOrderId: command.serviceOrderId,
      fromState: from,
      toState: command.targetState,
      context: command.context,
    });

    return { ok: true, state };
  }
}
