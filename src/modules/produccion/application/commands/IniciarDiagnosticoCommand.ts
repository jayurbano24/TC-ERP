import { IProduccionRepository } from '../../domain/repositories/IProduccionRepository';
import { DiagnosticoAggregate } from '../../domain/aggregates/DiagnosticoAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { z } from 'zod';

const schema = z.object({
  ordenLogisticaId: z.string().uuid(),
  tecnicoId: z.string().min(1, 'El técnico es obligatorio')
});

export class IniciarDiagnosticoCommand {
  constructor(private readonly repository: IProduccionRepository) {}

  async execute(ctx: RequestContext, payload: unknown): Promise<void> {
    const data = schema.parse(payload);

    // En un caso real buscaríamos si ya existe o lo creamos
    // Para simplificar, asumimos que se crea al iniciar si no existe
    const id = crypto.randomUUID();
    const diagnostico = DiagnosticoAggregate.create(id, ctx.tenantId!, ctx.branchId!, {
      ordenLogisticaId: data.ordenLogisticaId,
      estado: 'PENDIENTE'
    });

    diagnostico.iniciarDiagnostico(data.tecnicoId);

    await this.repository.saveDiagnostico(ctx, diagnostico);
  }
}
