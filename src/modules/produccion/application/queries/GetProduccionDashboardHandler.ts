import { injectable } from 'tsyringe';
import { IQueryHandler } from '../../../../modules/recepcion/application/cqrs/IQueryHandler';
import { GetProduccionDashboardQuery } from './GetProduccionDashboardQuery';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { getTenantPrisma } from '../../../../infrastructure/database/prisma/client';

@injectable()
export class GetProduccionDashboardHandler implements IQueryHandler<GetProduccionDashboardQuery, any> {
  async execute(query: GetProduccionDashboardQuery, ctx: RequestContext): Promise<any> {
    const prisma = getTenantPrisma(ctx);

    const [
      diagnosticosPendientes,
      diagnosticosEnProceso,
      reparacionesEnEspera,
      reparacionesActivas
    ] = await Promise.all([
      prisma.prodDiagnostico.count({ where: { estado: 'PENDIENTE', is_deleted: false } }),
      prisma.prodDiagnostico.count({ where: { estado: 'EN_PROCESO', is_deleted: false } }),
      prisma.prodReparacion.count({ where: { estado: 'ESPERA_REPUESTOS', is_deleted: false } }),
      prisma.prodReparacion.count({ where: { estado: 'REPARANDO', is_deleted: false } })
    ]);

    const ultimosDiagnosticos = await prisma.prodDiagnostico.findMany({
      where: { estado: 'COMPLETADO', is_deleted: false },
      orderBy: { updated_at: 'desc' },
      take: 10,
      select: {
        id: true,
        orden_logistica_id: true,
        tecnico_id: true,
        updated_at: true
      }
    });

    return {
      kpis: {
        diagnosticosPendientes,
        diagnosticosEnProceso,
        reparacionesEnEspera,
        reparacionesActivas
      },
      ultimosDiagnosticos
    };
  }
}
