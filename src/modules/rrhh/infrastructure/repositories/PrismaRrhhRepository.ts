import { IRrhhRepository } from '../../domain/repositories/IRrhhRepository';
import { EmpleadoAggregate } from '../../domain/aggregates/EmpleadoAggregate';
import { AsistenciaAggregate } from '../../domain/aggregates/AsistenciaAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { getTenantPrisma } from '../../../../infrastructure/database/prisma/client';

export class PrismaRrhhRepository implements IRrhhRepository {
  
  async saveEmpleado(ctx: RequestContext, empleado: EmpleadoAggregate): Promise<void> {
    const prisma = getTenantPrisma(ctx);
    const props = empleado.getProps();

    await prisma.$transaction(async (tx) => {
      await tx.rrhhEmpleado.upsert({
        where: { id: empleado.id },
        create: {
          id: empleado.id,
          tenant_id: empleado.tenantId,
          branch_id: empleado.branchId,
          user_id: props.userId,
          nombre: props.nombre,
          apellido: props.apellido,
          dni: props.dni,
          cargo: props.cargo,
          departamento: props.departamento,
          estado: props.estado
        },
        update: {
          estado: props.estado,
          cargo: props.cargo,
          departamento: props.departamento
        }
      });

      const events = empleado.getUncommittedEvents();
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

    empleado.clearEvents();
  }

  async getEmpleadoById(ctx: RequestContext, id: string): Promise<EmpleadoAggregate | null> {
    const prisma = getTenantPrisma(ctx);
    const doc = await prisma.rrhhEmpleado.findUnique({ where: { id } });
    if (!doc || doc.is_deleted) return null;

    // Use private constructor bypass or static create (simplification)
    return EmpleadoAggregate.create(doc.id, doc.tenant_id, doc.branch_id, {
      userId: doc.user_id || undefined,
      nombre: doc.nombre,
      apellido: doc.apellido,
      dni: doc.dni,
      cargo: doc.cargo,
      departamento: doc.departamento,
      estado: doc.estado as any
    });
  }

  async saveAsistencia(ctx: RequestContext, asistencia: AsistenciaAggregate): Promise<void> {
    const prisma = getTenantPrisma(ctx);
    const props = asistencia.getProps();

    await prisma.$transaction(async (tx) => {
      await tx.rrhhAsistencia.upsert({
        where: { id: asistencia.id },
        create: {
          id: asistencia.id,
          tenant_id: asistencia.tenantId,
          branch_id: asistencia.branchId,
          empleado_id: props.empleadoId,
          fecha: props.fecha,
          entrada: props.entrada,
          salida: props.salida,
          tipo: props.tipo
        },
        update: {
          salida: props.salida
        }
      });
    });
    asistencia.clearEvents();
  }

  async incrementarReparacionesExitosas(ctx: RequestContext, empleadoId: string, mes: number, anio: number): Promise<void> {
    const prisma = getTenantPrisma(ctx);
    await this.ensureDesempenoExists(prisma, ctx.tenantId, ctx.branchId, empleadoId, mes, anio);
    
    await prisma.rrhhDesempeno.update({
      where: {
        empleado_id_mes_anio: { empleado_id: empleadoId, mes, anio }
      },
      data: {
        reparaciones_exitosas: { increment: 1 }
      }
    });
  }

  async incrementarReparacionesFallidas(ctx: RequestContext, empleadoId: string, mes: number, anio: number): Promise<void> {
    const prisma = getTenantPrisma(ctx);
    await this.ensureDesempenoExists(prisma, ctx.tenantId, ctx.branchId, empleadoId, mes, anio);
    
    await prisma.rrhhDesempeno.update({
      where: {
        empleado_id_mes_anio: { empleado_id: empleadoId, mes, anio }
      },
      data: {
        reparaciones_fallidas: { increment: 1 }
      }
    });
  }

  async incrementarDiagnosticos(ctx: RequestContext, empleadoId: string, mes: number, anio: number): Promise<void> {
    const prisma = getTenantPrisma(ctx);
    await this.ensureDesempenoExists(prisma, ctx.tenantId, ctx.branchId, empleadoId, mes, anio);
    
    await prisma.rrhhDesempeno.update({
      where: {
        empleado_id_mes_anio: { empleado_id: empleadoId, mes, anio }
      },
      data: {
        equipos_diagnosticados: { increment: 1 }
      }
    });
  }

  private async ensureDesempenoExists(prisma: any, tenantId: string, branchId: string, empleadoId: string, mes: number, anio: number) {
    const exists = await prisma.rrhhDesempeno.findUnique({
      where: { empleado_id_mes_anio: { empleado_id: empleadoId, mes, anio } }
    });
    
    if (!exists) {
      await prisma.rrhhDesempeno.create({
        data: {
          tenant_id: tenantId,
          branch_id: branchId,
          empleado_id: empleadoId,
          mes,
          anio
        }
      });
    }
  }
}
