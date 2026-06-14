import { IDespachoRepository } from '../../domain/repositories/IDespachoRepository';
import { DespachoAggregate } from '../../domain/aggregates/DespachoAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const schema = z.object({
  reparacionId: z.string().uuid(),
  clienteNombre: z.string().min(2),
  equipoInfo: z.string().min(2),
});

export class CrearDespachoCommand {
  constructor(private readonly repository: IDespachoRepository) {}

  async execute(ctx: RequestContext, payload: unknown): Promise<string> {
    const data = schema.parse(payload);
    
    // Evitar duplicados
    const existente = await this.repository.getByReparacionId(ctx, data.reparacionId);
    if (existente) return existente.id;

    const despachoId = randomUUID();

    const despacho = DespachoAggregate.create(
      despachoId,
      ctx.tenantId,
      ctx.branchId,
      {
        reparacionId: data.reparacionId,
        clienteNombre: data.clienteNombre,
        equipoInfo: data.equipoInfo,
        estado: 'PENDIENTE'
      }
    );

    await this.repository.save(ctx, despacho);
    return despachoId;
  }
}
