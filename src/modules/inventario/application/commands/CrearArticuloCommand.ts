import { IInventarioRepository } from '../../domain/repositories/IInventarioRepository';
import { ArticuloAggregate } from '../../domain/aggregates/ArticuloAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { z } from 'zod';

const schema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(1),
  tipo: z.enum(['REPUESTO', 'EQUIPO', 'CONSUMIBLE']),
  stockInicial: z.number().min(0).default(0),
  stockMinimo: z.number().min(0).default(0),
  precioUnitario: z.number().min(0).default(0)
});

export class CrearArticuloCommand {
  constructor(private readonly repository: IInventarioRepository) {}

  async execute(ctx: RequestContext, payload: unknown): Promise<void> {
    const data = schema.parse(payload);

    const existe = await this.repository.getArticuloByCodigo(ctx, data.codigo);
    if (existe) {
      throw new Error(`El artículo con código ${data.codigo} ya existe.`);
    }

    const id = crypto.randomUUID();
    const articulo = ArticuloAggregate.create(id, ctx.tenantId!, ctx.branchId!, {
      codigo: data.codigo,
      nombre: data.nombre,
      tipo: data.tipo,
      stockActual: data.stockInicial,
      stockMinimo: data.stockMinimo,
      precioUnitario: data.precioUnitario
    });

    // Guardamos el agregado
    await this.repository.saveArticulo(ctx, articulo);

    // Registramos el movimiento inicial en la tabla cruda si el stock > 0
    if (data.stockInicial > 0) {
      await this.repository.registrarMovimiento(ctx, {
        articuloId: id,
        tipo: 'INGRESO',
        cantidad: data.stockInicial,
        motivo: 'Inventario Inicial'
      });
    }
  }
}
