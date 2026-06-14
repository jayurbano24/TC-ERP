import { IDespachoRepository } from '../../domain/repositories/IDespachoRepository';
import { DespachoAggregate } from '../../domain/aggregates/DespachoAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { getTenantPrisma } from '../../../../infrastructure/database/prisma/client';

export class PrismaDespachoRepository implements IDespachoRepository {
  async save(ctx: RequestContext, despacho: DespachoAggregate): Promise<void> {
    const prisma = getTenantPrisma(ctx);
    const props = despacho.getProps();

    await prisma.$transaction(async (tx) => {
      await tx.despachoOrden.upsert({
        where: { id: despacho.id },
        create: {
          id: despacho.id,
          tenant_id: despacho.tenantId,
          branch_id: despacho.branchId,
          reparacion_id: props.reparacionId,
          cliente_nombre: props.clienteNombre,
          equipo_info: props.equipoInfo,
          estado: props.estado,
          direccion: props.direccion,
          tracking_code: props.trackingCode,
          fecha_entrega: props.fechaEntrega
        },
        update: {
          estado: props.estado,
          direccion: props.direccion,
          tracking_code: props.trackingCode,
          fecha_entrega: props.fechaEntrega
        }
      });

      const events = despacho.getUncommittedEvents();
      for (const event of events) {
        await tx.outboxEvent.create({
          data: {
            aggregate_id: event.aggregateId,
            event_name: event.eventName,
            payload: event.payload ? JSON.stringify(event.payload) : '{}',
          }
        });
      }
    });

    despacho.clearEvents();
  }

  async getById(ctx: RequestContext, id: string): Promise<DespachoAggregate | null> {
    const prisma = getTenantPrisma(ctx);
    const doc = await prisma.despachoOrden.findUnique({ where: { id } });
    if (!doc || doc.is_deleted) return null;

    return DespachoAggregate.create(doc.id, doc.tenant_id, doc.branch_id, {
      reparacionId: doc.reparacion_id,
      clienteNombre: doc.cliente_nombre,
      equipoInfo: doc.equipo_info,
      estado: doc.estado as any,
      direccion: doc.direccion || undefined,
      trackingCode: doc.tracking_code || undefined,
      fechaEntrega: doc.fecha_entrega || undefined
    });
  }

  async getByReparacionId(ctx: RequestContext, reparacionId: string): Promise<DespachoAggregate | null> {
    const prisma = getTenantPrisma(ctx);
    const doc = await prisma.despachoOrden.findUnique({ where: { reparacion_id: reparacionId } });
    if (!doc || doc.is_deleted) return null;

    return DespachoAggregate.create(doc.id, doc.tenant_id, doc.branch_id, {
      reparacionId: doc.reparacion_id,
      clienteNombre: doc.cliente_nombre,
      equipoInfo: doc.equipo_info,
      estado: doc.estado as any,
      direccion: doc.direccion || undefined,
      trackingCode: doc.tracking_code || undefined,
      fechaEntrega: doc.fecha_entrega || undefined
    });
  }
}
