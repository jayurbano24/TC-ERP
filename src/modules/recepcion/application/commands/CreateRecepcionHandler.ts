import { injectable, inject } from 'tsyringe';
import { ICommandHandler } from '../cqrs/ICommandHandler';
import { CreateRecepcionCommand } from './CreateRecepcionCommand';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { OrdenServicioAggregate } from '../../domain/aggregates/OrdenServicioAggregate';
import type { IOrdenServicioRepository } from '../../domain/repositories/IOrdenServicioRepository';
import type { IEventBus } from '../../../../shared/events/IEventBus';

@injectable()
export class CreateRecepcionHandler implements ICommandHandler<CreateRecepcionCommand, void> {
  constructor(
    @inject('IOrdenServicioRepository') private readonly repository: IOrdenServicioRepository,
    @inject('EventBus') private readonly eventBus: IEventBus
  ) {}

  async execute(command: CreateRecepcionCommand, ctx: RequestContext): Promise<void> {
    const ordenId = `ORD-${Date.now()}`;
    const { tipo, payload } = command;

    const props = {
      equipo: {
        id: `EQ-${Date.now()}`,
        numeroSerie: payload.numeroSerie,
        marca: payload.marca,
        modelo: payload.modelo,
        tipoDispositivo: payload.tipoDispositivo,
      },
      estadoRecepcion: 'INGRESADA',
      fallaReportada: payload.fallaReportada,
      diagnosticoInicial: payload.diagnosticoInicial,
      guiaPx: payload.guiaPx,
      transporte: payload.transporte,
    };

    // El Aggregate valida las reglas de CAC vs PX
    const orden = OrdenServicioAggregate.create(ordenId, ctx.tenantId, ctx.branchId, tipo, props);

    // Guardar en base de datos
    await this.repository.save(orden);

    // Emitir eventos de dominio
    for (const event of orden.domainEvents) {
      await this.eventBus.emit(event);
    }
    orden.clearEvents();
  }
}
