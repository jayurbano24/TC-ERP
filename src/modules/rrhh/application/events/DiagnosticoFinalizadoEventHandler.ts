import { IEventHandler } from '../../../../shared/events/IEventBus';
import { DomainEvent } from '../../../../shared/domain/BaseAggregate';
import { IRrhhRepository } from '../../domain/repositories/IRrhhRepository';
import { RequestContextBuilder } from '../../../../shared/context/RequestContextBuilder';

export class DiagnosticoFinalizadoEventHandler implements IEventHandler {
  constructor(private readonly repository: IRrhhRepository) {}

  async handle(event: DomainEvent): Promise<void> {
    const payload: any = event.payload;

    // Producción envía el ID del técnico que diagnosticó
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
      await this.repository.incrementarDiagnosticos(ctx, payload.tecnicoId, mes, anio);
      console.log(`[RRHH] KPI 'diagnósticos' incrementado para técnico ${payload.tecnicoId}.`);
    } catch (e) {
      console.error(`[RRHH] Error incrementando KPI diagnóstico para técnico ${payload.tecnicoId}`, e);
    }
  }
}
