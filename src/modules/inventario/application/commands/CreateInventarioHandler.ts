import type { ICommandHandler } from '../../../recepcion/application/cqrs/ICommandHandler';
import type { IEventBus } from '../../../../shared/events/IEventBus';
import type { IInventarioRepository } from '../../domain/repositories/IInventarioRepository';
import { CreateInventarioCommand } from './CreateInventarioCommand';
import { InventarioAggregate } from '../../domain/aggregates/InventarioAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { injectable, inject } from 'tsyringe';

@injectable()
export class CreateInventarioHandler implements ICommandHandler<CreateInventarioCommand, void> {
  constructor(
    @inject('IInventarioRepository') private repository: IInventarioRepository,
    @inject('EventBus') private eventBus: IEventBus
  ) {}

  async execute(command: CreateInventarioCommand, context?: RequestContext): Promise<void> {
    const tenantId = context?.tenantId || 'default-tenant';
    const branchId = context?.branchId || 'default-branch';
    const id = `inv-${Date.now()}`; // ID temporal hasta usar UUID

    const inventario = InventarioAggregate.create(id, tenantId, branchId, {
      sku: command.sku,
      cantidad: command.cantidad,
      estado: 'DISPONIBLE',
      ubicacion: command.ubicacion
    });

    await this.repository.save(inventario);

    for (const event of inventario.domainEvents) {
      await this.eventBus.emit(event);
    }
  }
}
