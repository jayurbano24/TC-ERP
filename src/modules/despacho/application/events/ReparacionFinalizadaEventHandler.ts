import { IEventHandler } from '../../../../shared/events/IEventHandler';
import { DomainEvent } from '../../../../shared/events/DomainEvent';
import { CrearDespachoCommand } from '../commands/CrearDespachoCommand';
import { RequestContextBuilder } from '../../../../shared/context/RequestContextBuilder';

export class ReparacionFinalizadaEventHandler implements IEventHandler<any> {
  constructor(private readonly command: CrearDespachoCommand) {}

  async handle(event: any): Promise<void> {
    const payload: any = event.payload;

    const ctx = new RequestContextBuilder()
      .withTenant(payload.tenantId)
      .withBranch(payload.branchId)
      .withUser('SYSTEM_EVENT_BUS')
      .build();

    console.log(`[Despacho] Equipo de reparación ${event.aggregateId} listo para despachar. Creando orden...`);

    try {
      await this.command.execute(ctx, {
        reparacionId: event.aggregateId,
        clienteNombre: payload.clienteNombre || 'Cliente Estándar',
        equipoInfo: payload.equipoInfo || 'Equipo Reparado'
      });
      console.log(`[Despacho] Orden de despacho pendiente creada exitosamente para reparación ${event.aggregateId}`);
    } catch (e) {
      console.error(`[Despacho] Error al encolar orden de despacho para reparación ${event.aggregateId}:`, e);
    }
  }
}
