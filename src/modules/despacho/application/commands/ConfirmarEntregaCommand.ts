import { IDespachoRepository } from '../../domain/repositories/IDespachoRepository';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { z } from 'zod';

const schema = z.object({
  despachoId: z.string().uuid(),
  fechaEntrega: z.date().optional()
});

export class ConfirmarEntregaCommand {
  constructor(private readonly repository: IDespachoRepository) {}

  async execute(ctx: RequestContext, payload: unknown): Promise<void> {
    const data = schema.parse(payload);
    
    const despacho = await this.repository.getById(ctx, data.despachoId);
    if (!despacho) {
      throw new Error(`Orden de despacho ${data.despachoId} no encontrada`);
    }

    despacho.confirmarEntrega(data.fechaEntrega || new Date());

    await this.repository.save(ctx, despacho);
  }
}
