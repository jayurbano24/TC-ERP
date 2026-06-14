import { getTenantPrisma } from '../../../../infrastructure/database/prisma/client';
import { RequestContext } from '../../../../shared/context/RequestContext';

export class GetInventarioValorizadoQuery {
  async execute(ctx: RequestContext) {
    const prisma = getTenantPrisma(ctx);

    const articulos = await prisma.invArticulo.findMany({
      where: { is_deleted: false },
      select: {
        id: true,
        codigo: true,
        nombre: true,
        tipo: true,
        stock_actual: true,
        precio_unitario: true,
      }
    });

    let totalArticulos = 0;
    let valorTotal = 0;
    let itemsCriticos = 0;

    const items = articulos.map(art => {
      const valor = art.stock_actual * art.precio_unitario;
      totalArticulos += art.stock_actual;
      valorTotal += valor;
      if (art.stock_actual <= 0) itemsCriticos++;

      return {
        id: art.id,
        codigo: art.codigo,
        nombre: art.nombre,
        tipo: art.tipo,
        stockActual: art.stock_actual,
        precioUnitario: art.precio_unitario,
        valorTotal: valor
      };
    });

    return {
      kpis: {
        totalArticulos,
        valorTotal,
        itemsCriticos,
        totalReferencias: articulos.length
      },
      items
    };
  }
}
