import { IInventarioRepository } from '../../domain/repositories/IInventarioRepository';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { z } from 'zod';

const schema = z.object({
  articuloId: z.string().uuid(),
  cantidad: z.number().positive(),
  tipoMovimiento: z.enum(['INGRESO', 'SALIDA', 'AJUSTE']),
  motivo: z.string().optional(),
  referenciaId: z.string().optional()
});

export class AjustarStockCommand {
  constructor(private readonly repository: IInventarioRepository) {}

  async execute(ctx: RequestContext, payload: unknown): Promise<void> {
    const data = schema.parse(payload);

    const articulo = await this.repository.getArticuloById(ctx, data.articuloId);
    if (!articulo) {
      throw new Error(`El artículo con ID ${data.articuloId} no existe.`);
    }

    articulo.ajustarStock(data.cantidad, data.tipoMovimiento, data.motivo, data.referenciaId);

    // Persistir el estado del agregado
    await this.repository.saveArticulo(ctx, articulo);

    // Persistir el movimiento crudo
    await this.repository.registrarMovimiento(ctx, {
      articuloId: articulo.id,
      tipo: data.tipoMovimiento,
      cantidad: data.cantidad,
      motivo: data.motivo,
      referenciaId: data.referenciaId
    });
  }
}
