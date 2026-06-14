import { IRrhhRepository } from '../../domain/repositories/IRrhhRepository';
import { AsistenciaAggregate } from '../../domain/aggregates/AsistenciaAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const schema = z.object({
  empleadoId: z.string().uuid(),
  tipo: z.enum(['PRESENCIAL', 'REMOTO', 'FALTA', 'PERMISO']),
  entrada: z.date().optional(),
  salida: z.date().optional(),
});

export class RegistrarAsistenciaCommand {
  constructor(private readonly repository: IRrhhRepository) {}

  async execute(ctx: RequestContext, payload: unknown): Promise<string> {
    const data = schema.parse(payload);
    const asistenciaId = randomUUID();

    const empleado = await this.repository.getEmpleadoById(ctx, data.empleadoId);
    if (!empleado) {
      throw new Error(`Empleado ${data.empleadoId} no encontrado`);
    }

    const asistencia = AsistenciaAggregate.create(
      asistenciaId,
      ctx.tenantId,
      ctx.branchId,
      {
        empleadoId: data.empleadoId,
        fecha: new Date(),
        tipo: data.tipo,
        entrada: data.entrada,
        salida: data.salida
      }
    );

    await this.repository.saveAsistencia(ctx, asistencia);
    return asistenciaId;
  }
}
