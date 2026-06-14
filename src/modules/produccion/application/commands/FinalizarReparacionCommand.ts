import { IProduccionRepository } from '../../domain/repositories/IProduccionRepository';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { z } from 'zod';

const schema = z.object({
  reparacionId: z.string().uuid(),
  tiempoMinutos: z.number().min(1)
});

export class FinalizarReparacionCommand {
  constructor(private readonly repository: IProduccionRepository) {}

  async execute(ctx: RequestContext, payload: unknown): Promise<void> {
    const data = schema.parse(payload);

    const reparacion = await this.repository.getReparacionById(ctx, data.reparacionId);
    if (!reparacion) {
      throw new Error(`Reparación con ID ${data.reparacionId} no encontrada`);
    }

    reparacion.finalizar(data.tiempoMinutos);

    await this.repository.saveReparacion(ctx, reparacion);
  }
}
