import type { OpenDispatchBatchParams } from '../../domain/types/dispatch-batch.types';

export class OpenDispatchBatchCommand {
  constructor(
    readonly destination: string | undefined,
    readonly guideOutbound: string | undefined,
    readonly notes: string | undefined,
    readonly operatorId: string | null | undefined,
    readonly operatorName: string | undefined
  ) {}

  static from(params: OpenDispatchBatchParams): OpenDispatchBatchCommand {
    return new OpenDispatchBatchCommand(
      params.destination,
      params.guideOutbound,
      params.notes,
      params.operatorId,
      params.operatorName
    );
  }
}
