import type { ServiceOrderOperationalState } from '../../domain/entities/service-order-operational-state.entity';
import type { IOperationalStateRepository } from '../../domain/ports/operational-state.repository.port';
import { GetOsOperationalStateQuery } from './get-os-operational-state.query';

export class GetOsOperationalStateHandler {
  constructor(private readonly repository: IOperationalStateRepository) {}

  async execute(
    query: GetOsOperationalStateQuery
  ): Promise<ServiceOrderOperationalState | null> {
    return this.repository.getByServiceOrderId(query.serviceOrderId);
  }
}
