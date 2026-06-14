import { getTenantPrisma } from '../../../../infrastructure/database/prisma/client';
import { RequestContext } from '../../../../shared/context/RequestContext';

export class GetRendimientoTecnicosQuery {
  async execute(ctx: RequestContext, mes: number, anio: number) {
    const prisma = getTenantPrisma(ctx);

    const rendimientos = await prisma.rrhhDesempeno.findMany({
      where: { mes, anio },
      include: { empleado: true }
    });

    return rendimientos.map(r => ({
      empleadoId: r.empleado_id,
      nombre: `${r.empleado.nombre} ${r.empleado.apellido}`,
      departamento: r.empleado.departamento,
      cargo: r.empleado.cargo,
      equiposDiagnosticados: r.equipos_diagnosticados,
      reparacionesExitosas: r.reparaciones_exitosas,
      reparacionesFallidas: r.reparaciones_fallidas,
      tasaExito: r.reparaciones_exitosas + r.reparaciones_fallidas > 0 
        ? (r.reparaciones_exitosas / (r.reparaciones_exitosas + r.reparaciones_fallidas)) * 100 
        : 0
    }));
  }
}
