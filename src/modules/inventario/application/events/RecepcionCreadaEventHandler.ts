import { IEventHandler } from '../../../../shared/events/IEventBus';
import { DomainEvent } from '../../../../shared/domain/BaseAggregate';
import { CrearArticuloCommand } from '../commands/CrearArticuloCommand';
import { RequestContextBuilder } from '../../../../shared/context/RequestContextBuilder';
import { IInventarioRepository } from '../../domain/repositories/IInventarioRepository';

export class RecepcionCreadaEventHandler implements IEventHandler {
  constructor(
    private readonly repository: IInventarioRepository,
    private readonly command: CrearArticuloCommand
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const payload: any = event.payload;

    if (!payload.equipos || !Array.isArray(payload.equipos) || payload.equipos.length === 0) {
      return;
    }

    const ctx = new RequestContextBuilder()
      .withTenant(payload.tenantId)
      .withBranch(payload.branchId)
      .withUser('SYSTEM_EVENT_BUS')
      .build();

    console.log(`[Inventario] Procesando ingresos de equipos para Recepción ${event.aggregateId}...`);

    for (const equipo of payload.equipos) {
      try {
        const articuloExistente = await this.repository.getArticuloByCodigo(ctx, equipo.serialNumber);
        
        if (!articuloExistente) {
          // El equipo no existe en el inventario general, lo creamos
          await this.command.execute(ctx, {
            codigo: equipo.serialNumber,
            nombre: `Equipo ${equipo.technologyId || 'Desconocido'} SN: ${equipo.serialNumber}`,
            tipo: 'EQUIPO',
            stockInicial: 1,
            stockMinimo: 0,
            precioUnitario: 0
          });
          console.log(`[Inventario] Creado equipo ${equipo.serialNumber} en inventario`);
        } else {
          // Si ya existe (ej. un re-ingreso o RMA), podríamos hacer un AjustarStockCommand aquí si el modelo de negocio lo requiere.
          console.log(`[Inventario] El equipo ${equipo.serialNumber} ya existe en el maestro de artículos.`);
        }
      } catch (error) {
        console.error(`[Inventario] Error al procesar equipo ${equipo.serialNumber}:`, error);
      }
    }
  }
}
