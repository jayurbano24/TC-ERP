import { IProduccionRepository } from '../../domain/repositories/IProduccionRepository';
import { DiagnosticoAggregate } from '../../domain/aggregates/DiagnosticoAggregate';
import { ReparacionAggregate } from '../../domain/aggregates/ReparacionAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { BasePrismaRepository } from '../../../../infrastructure/database/repositories/BasePrismaRepository';
import { getTenantPrisma } from '../../../../infrastructure/database/prisma/client';
import { injectable } from 'tsyringe';

@injectable()
export class PrismaProduccionRepository extends BasePrismaRepository implements IProduccionRepository {
  
  async saveDiagnostico(ctx: RequestContext, diagnostico: DiagnosticoAggregate): Promise<void> {
    const prisma = getTenantPrisma(ctx);
    
    await prisma.$transaction(async (tx) => {
      await tx.prodDiagnostico.upsert({
        where: { id: diagnostico.id },
        update: {
          estado: diagnostico.props.estado,
          tecnico_id: diagnostico.props.tecnicoId,
          observaciones: diagnostico.props.observaciones,
        },
        create: {
          id: diagnostico.id,
          orden_logistica_id: diagnostico.props.ordenLogisticaId,
          estado: diagnostico.props.estado,
          tecnico_id: diagnostico.props.tecnicoId,
          observaciones: diagnostico.props.observaciones,
          tenant_id: ctx.tenantId!,
          branch_id: ctx.branchId!
        }
      });

      await this.saveEvents(tx, ctx, diagnostico.clearEvents());
    });
  }

  async getDiagnosticoById(ctx: RequestContext, id: string): Promise<DiagnosticoAggregate | null> {
    const prisma = getTenantPrisma(ctx);
    const row = await prisma.prodDiagnostico.findUnique({ where: { id } });
    if (!row) return null;
    
    return DiagnosticoAggregate.create(row.id, row.tenant_id, row.branch_id, {
      ordenLogisticaId: row.orden_logistica_id,
      tecnicoId: row.tecnico_id || undefined,
      estado: row.estado as any,
      observaciones: row.observaciones || undefined
    });
  }

  async saveReparacion(ctx: RequestContext, reparacion: ReparacionAggregate): Promise<void> {
    const prisma = getTenantPrisma(ctx);
    
    await prisma.$transaction(async (tx) => {
      await tx.prodReparacion.upsert({
        where: { id: reparacion.id },
        update: {
          estado: reparacion.props.estado,
          tecnico_id: reparacion.props.tecnicoId,
          repuestos_usados: reparacion.props.repuestosUsados,
          tiempo_invertido: reparacion.props.tiempoInvertido
        },
        create: {
          id: reparacion.id,
          diagnostico_id: reparacion.props.diagnosticoId,
          estado: reparacion.props.estado,
          tecnico_id: reparacion.props.tecnicoId,
          repuestos_usados: reparacion.props.repuestosUsados,
          tiempo_invertido: reparacion.props.tiempoInvertido,
          tenant_id: ctx.tenantId!,
          branch_id: ctx.branchId!
        }
      });

      await this.saveEvents(tx, ctx, reparacion.clearEvents());
    });
  }

  async getReparacionById(ctx: RequestContext, id: string): Promise<ReparacionAggregate | null> {
    const prisma = getTenantPrisma(ctx);
    const row = await prisma.prodReparacion.findUnique({ where: { id } });
    if (!row) return null;
    
    return ReparacionAggregate.create(row.id, row.tenant_id, row.branch_id, {
      diagnosticoId: row.diagnostico_id,
      tecnicoId: row.tecnico_id || undefined,
      estado: row.estado as any,
      repuestosUsados: row.repuestos_usados || undefined,
      tiempoInvertido: row.tiempo_invertido || undefined
    });
  }
}
