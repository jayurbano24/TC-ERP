import { IInventarioRepository } from '../../domain/repositories/IInventarioRepository';
import { ArticuloAggregate } from '../../domain/aggregates/ArticuloAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { BasePrismaRepository } from '../../../../shared/infrastructure/repositories/BasePrismaRepository';

export class PrismaInventarioRepository extends BasePrismaRepository<ArticuloAggregate> implements IInventarioRepository {
  
  async getArticuloById(ctx: RequestContext, id: string): Promise<ArticuloAggregate | null> {
    const prisma = this.getPrisma(ctx);
    const row = await prisma.invArticulo.findUnique({
      where: { id }
    });

    if (!row || row.is_deleted) return null;

    return this.mapToDomain(row);
  }

  async getArticuloByCodigo(ctx: RequestContext, codigo: string): Promise<ArticuloAggregate | null> {
    const prisma = this.getPrisma(ctx);
    const row = await prisma.invArticulo.findUnique({
      where: { codigo }
    });

    if (!row || row.is_deleted) return null;

    return this.mapToDomain(row);
  }

  async saveArticulo(ctx: RequestContext, articulo: ArticuloAggregate): Promise<void> {
    const prisma = this.getPrisma(ctx);
    const data = {
      tenant_id: articulo.tenantId,
      branch_id: articulo.branchId,
      codigo: articulo.props.codigo,
      nombre: articulo.props.nombre,
      tipo: articulo.props.tipo,
      stock_actual: articulo.props.stockActual,
      stock_minimo: articulo.props.stockMinimo,
      precio_unitario: articulo.props.precioUnitario
    };

    await prisma.$transaction(async (tx) => {
      await tx.invArticulo.upsert({
        where: { id: articulo.id },
        create: { id: articulo.id, ...data },
        update: data
      });

      await this.saveOutboxEvents(tx, articulo);
      articulo.clearDomainEvents();
    });
  }

  async registrarMovimiento(ctx: RequestContext, payload: {
    articuloId: string;
    tipo: 'INGRESO' | 'SALIDA' | 'AJUSTE';
    cantidad: number;
    motivo?: string;
    referenciaId?: string;
  }): Promise<void> {
    const prisma = this.getPrisma(ctx);
    await prisma.invMovimiento.create({
      data: {
        tenant_id: ctx.tenantId!,
        branch_id: ctx.branchId!,
        articulo_id: payload.articuloId,
        tipo: payload.tipo,
        cantidad: payload.cantidad,
        motivo: payload.motivo,
        referencia_id: payload.referenciaId,
        created_by: ctx.userId
      }
    });
  }

  private mapToDomain(row: any): ArticuloAggregate {
    // Para simplificar, usamos un hack temporal en TS para no exponer el constructor privado
    // En un sistema estricto usaríamos un Mapper dedicado
    return (ArticuloAggregate as any).create(row.id, row.tenant_id, row.branch_id, {
      codigo: row.codigo,
      nombre: row.nombre,
      tipo: row.tipo,
      stockActual: row.stock_actual,
      stockMinimo: row.stock_minimo,
      precioUnitario: row.precio_unitario
    });
  }
}
