import { IProduccionRepository } from '../../domain/repositories/IProduccionRepository';
import { ReparacionAggregate } from '../../domain/aggregates/ReparacionAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { z } from 'zod';

const schema = z.object({
  reparacionId: z.string().uuid(),
  repuestos: z.array(z.object({
    codigo: z.string(),
    cantidad: z.number().min(1)
  }))
});

export class RegistrarRepuestoCommand {
  constructor(private readonly repository: IProduccionRepository) {}

  async execute(ctx: RequestContext, payload: unknown): Promise<void> {
    const data = schema.parse(payload);

    const reparacion = await this.repository.getReparacionById(ctx, data.reparacionId);
    if (!reparacion) {
      throw new Error(`Reparación con ID ${data.reparacionId} no encontrada`);
    }

    reparacion.registrarRepuestos(JSON.stringify(data.repuestos));

    await this.repository.saveReparacion(ctx, reparacion);
  }
}
