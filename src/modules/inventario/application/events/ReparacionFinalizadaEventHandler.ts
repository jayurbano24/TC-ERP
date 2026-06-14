import { IEventHandler } from '../../../../shared/events/IEventBus';
import { DomainEvent } from '../../../../shared/domain/BaseAggregate';
import { AjustarStockCommand } from '../commands/AjustarStockCommand';
import { RequestContextBuilder } from '../../../../shared/context/RequestContextBuilder';
import { IInventarioRepository } from '../../domain/repositories/IInventarioRepository';

export class ReparacionFinalizadaEventHandler implements IEventHandler {
  constructor(
    private readonly repository: IInventarioRepository,
    private readonly command: AjustarStockCommand
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const payload: any = event.payload;

    if (!payload.repuestosUsados || !Array.isArray(payload.repuestosUsados) || payload.repuestosUsados.length === 0) {
      console.log(`[Inventario] Reparación ${event.aggregateId} finalizada sin repuestos. No se afecta inventario.`);
      return;
    }

    const ctx = new RequestContextBuilder()
      .withTenant(payload.tenantId)
      .withBranch(payload.branchId)
      .withUser('SYSTEM_EVENT_BUS')
      .build();

    console.log(`[Inventario] Procesando consumo de repuestos para reparación ${event.aggregateId}...`);

    for (const repuesto of payload.repuestosUsados) {
      try {
        const articulo = await this.repository.getArticuloByCodigo(ctx, repuesto.codigo);
        if (!articulo) {
          console.warn(`[Inventario] El repuesto ${repuesto.codigo} no existe en inventario. Saltando consumo.`);
          continue;
        }

        await this.command.execute(ctx, {
          articuloId: articulo.id,
          cantidad: repuesto.cantidad,
          tipoMovimiento: 'SALIDA',
          motivo: `Consumo en Reparación`,
          referenciaId: event.aggregateId
        });
        console.log(`[Inventario] Consumidos ${repuesto.cantidad}x de ${repuesto.codigo}`);
      } catch (error) {
        console.error(`[Inventario] Error al descontar repuesto ${repuesto.codigo}:`, error);
        // Podríamos encolar un mensaje en una "Dead Letter Queue" para reintentar
      }
    }
  }
}
