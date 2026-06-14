import { IEventHandler } from '../../../../shared/events/IEventBus';
import { DomainEvent } from '../../../../shared/domain/BaseAggregate';
import { IRrhhRepository } from '../../domain/repositories/IRrhhRepository';
import { RequestContextBuilder } from '../../../../shared/context/RequestContextBuilder';

export class ReparacionFinalizadaEventHandler implements IEventHandler {
  constructor(private readonly repository: IRrhhRepository) {}

  async handle(event: DomainEvent): Promise<void> {
    const payload: any = event.payload;

    if (!payload.tecnicoId) return;

    const ctx = new RequestContextBuilder()
      .withTenant(payload.tenantId)
      .withBranch(payload.branchId)
      .withUser('SYSTEM_EVENT_BUS')
      .build();

    const ahora = new Date();
    const mes = ahora.getMonth() + 1;
    const anio = ahora.getFullYear();

    try {
      if (payload.exito === true || payload.exito === undefined) {
        await this.repository.incrementarReparacionesExitosas(ctx, payload.tecnicoId, mes, anio);
        console.log(`[RRHH] KPI 'reparación exitosa' incrementado para técnico ${payload.tecnicoId}.`);
      } else {
        await this.repository.incrementarReparacionesFallidas(ctx, payload.tecnicoId, mes, anio);
        console.log(`[RRHH] KPI 'reparación fallida' incrementado para técnico ${payload.tecnicoId}.`);
      }
    } catch (e) {
      console.error(`[RRHH] Error incrementando KPI reparación para técnico ${payload.tecnicoId}`, e);
    }
  }
}
