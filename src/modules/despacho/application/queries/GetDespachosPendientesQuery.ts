import { getTenantPrisma } from '../../../../infrastructure/database/prisma/client';
import { RequestContext } from '../../../../shared/context/RequestContext';

export class GetDespachosPendientesQuery {
  async execute(ctx: RequestContext) {
    const prisma = getTenantPrisma(ctx);

    const despachos = await prisma.despachoOrden.findMany({
      where: { estado: 'PENDIENTE', is_deleted: false },
      orderBy: { created_at: 'asc' }
    });

    return despachos.map(d => ({
      id: d.id,
      reparacionId: d.reparacion_id,
      cliente: d.cliente_nombre,
      equipo: d.equipo_info,
      estado: d.estado,
      tiempoEnEspera: Math.floor((new Date().getTime() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24)) // días en espera
    }));
  }
}
