import { injectable, inject } from 'tsyringe';
import type { IEventHandler } from '../../../../shared/events/IEventHandler';
import type { IEventBus } from '../../../../shared/events/IEventBus';
import type { IInventarioRepository } from '../../domain/repositories/IInventarioRepository';
import { InventarioAggregate } from '../../domain/aggregates/InventarioAggregate';

// Tipamos el payload esperado sin acoplarnos al módulo de Recepción
interface RecepcionPayload {
  id: string;
  tipo: string;
  items: Array<{ sku: string; cantidad: number }>;
  tenant: string;
  branch: string;
}

@injectable()
export class InventarioCreatedFromRecepcionHandler implements IEventHandler<any> {
  constructor(
    @inject('IInventarioRepository') private repository: IInventarioRepository,
    @inject('IEventBus') private eventBus: IEventBus
  ) {}

  async handle(event: any): Promise<void> {
    const payload = event as RecepcionPayload;
    
    // Por cada item recibido en la recepción, creamos/ajustamos inventario
    // (Simplificado para el caso base, normalmente habría un mapeo complejo o un solo registro)
    for (const item of payload.items) {
      // Generar un ID único para el registro de inventario (en la vida real se usaría UUID)
      const inventarioId = `${payload.id}-${item.sku}`;

      const inventario = InventarioAggregate.createFromRecepcion(
        inventarioId,
        payload.tenant,
        payload.branch,
        payload.id,
        item.sku,
        item.cantidad
      );

      await this.repository.save(inventario);

      for (const domainEvent of inventario.domainEvents) {
        await this.eventBus.emit(domainEvent);
      }
    }
  }
}
