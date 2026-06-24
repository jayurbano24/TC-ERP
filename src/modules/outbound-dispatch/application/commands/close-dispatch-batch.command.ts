export class CloseDispatchBatchCommand {
  constructor(
    readonly batchId: string,
    readonly operatorId: string | null | undefined,
    readonly operatorName: string | undefined
  ) {}
}
