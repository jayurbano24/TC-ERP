import { BasePrismaRepository } from '../../../../infrastructure/database/repositories/BasePrismaRepository';
import { IOrdenServicioRepository } from '../../domain/repositories/IOrdenServicioRepository';
import { OrdenServicioAggregate } from '../../domain/aggregates/OrdenServicioAggregate';
import { PrismaClient } from '@prisma/client';
import { injectable, inject } from 'tsyringe';
import { OrdenServicioMapper } from '../mappers/OrdenServicioMapper';

@injectable()
export class PrismaOrdenServicioRepository
  extends BasePrismaRepository<OrdenServicioAggregate, any>
  implements IOrdenServicioRepository
{
  constructor(
    @inject('PrismaClient') prismaClient: PrismaClient,
    @inject(OrdenServicioMapper) mapper: OrdenServicioMapper
  ) {
    super(prismaClient, mapper);
  }

  get delegate() {
    return this.prisma.logOrdenServicio;
  }

  // Sobrescribimos save para guardar con transacciones (Outbox + Tablas anidadas)
  async save(entity: OrdenServicioAggregate): Promise<void> {
    const persistenceModel = this.mapper.toPersistence(entity);
    const domainEvents = entity.domainEvents;

    await this.prisma.$transaction(async (tx: any) => {
      // Guardar el equipo
      await tx.logEquipo.upsert({
        where: { id: entity.props.equipo.id },
        update: {
          numero_serie: entity.props.equipo.numeroSerie,
          marca: entity.props.equipo.marca,
          modelo: entity.props.equipo.modelo,
          tipo_dispositivo: entity.props.equipo.tipoDispositivo,
        },
        create: {
          id: entity.props.equipo.id,
          numero_serie: entity.props.equipo.numeroSerie,
          marca: entity.props.equipo.marca,
          modelo: entity.props.equipo.modelo,
          tipo_dispositivo: entity.props.equipo.tipoDispositivo,
          tenant_id: entity.tenantId,
          branch_id: entity.branchId
        }
      });

      // Guardar la orden
      await tx.logOrdenServicio.upsert({
        where: { id: entity.id },
        update: persistenceModel,
        create: persistenceModel
      });

      // Insertar eventos de dominio en Outbox
      for (const event of domainEvents) {
        await tx.outboxEvent.create({
          data: {
            event_name: event.eventName,
            payload: JSON.stringify(event.payload),
            status: 'PENDING'
          }
        });
      }
    });

    entity.clearEvents();
  }
}
