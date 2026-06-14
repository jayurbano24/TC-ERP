import { getTenantPrisma } from '../../../../infrastructure/database/prisma/client';
import { RequestContext } from '../../../../shared/context/RequestContext';

export class GetReporteAsistenciaQuery {
  async execute(ctx: RequestContext, fechaInicio: Date, fechaFin: Date) {
    const prisma = getTenantPrisma(ctx);

    const asistencias = await prisma.rrhhAsistencia.findMany({
      where: {
        fecha: {
          gte: fechaInicio,
          lte: fechaFin
        }
      },
      include: { empleado: true },
      orderBy: { fecha: 'desc' }
    });

    return asistencias.map(a => ({
      empleadoId: a.empleado_id,
      nombre: `${a.empleado.nombre} ${a.empleado.apellido}`,
      fecha: a.fecha,
      entrada: a.entrada,
      salida: a.salida,
      tipo: a.tipo,
      horasTrabajadas: a.entrada && a.salida ? (a.salida.getTime() - a.entrada.getTime()) / (1000 * 60 * 60) : 0
    }));
  }
}
