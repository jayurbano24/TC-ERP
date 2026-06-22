import type { OperationalSnapshot } from '../../domain/entities/service-order-operational-state.entity';
import type { IOperationalStateRepository } from '../../domain/ports/operational-state.repository.port';
import { GetOperationalSnapshotQuery } from './get-operational-snapshot.query';

export class GetOperationalSnapshotHandler {
  constructor(private readonly repository: IOperationalStateRepository) {}

  async execute(_query: GetOperationalSnapshotQuery): Promise<OperationalSnapshot> {
    return this.repository.getOperationalSnapshot();
  }
}
