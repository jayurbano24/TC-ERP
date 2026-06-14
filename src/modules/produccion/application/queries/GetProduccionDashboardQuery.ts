import { getTenantPrisma } from '../../../../infrastructure/database/prisma/client';
import { RequestContext } from '../../../../shared/context/RequestContext';

export class GetProduccionDashboardQuery {
  async execute(ctx: RequestContext) {
    const prisma = getTenantPrisma(ctx);

    // En CQRS, el Read Model hace consultas directas (o SQL crudo) para maximizar rendimiento
    // sin pasar por los Aggregates de Dominio que son costosos de instanciar.
    
    // Obtenemos estadísticas básicas de producción
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

    // Últimos diagnósticos completados
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
