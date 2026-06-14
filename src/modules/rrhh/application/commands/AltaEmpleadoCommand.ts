import { IRrhhRepository } from '../../domain/repositories/IRrhhRepository';
import { EmpleadoAggregate } from '../../domain/aggregates/EmpleadoAggregate';
import { RequestContext } from '../../../../shared/context/RequestContext';
import { randomUUID } from 'crypto';
import { z } from 'zod';

const schema = z.object({
  nombre: z.string().min(2),
  apellido: z.string().min(2),
  dni: z.string().min(5),
  cargo: z.string().min(2),
  departamento: z.string().min(2),
  userId: z.string().uuid().optional(),
});

export class AltaEmpleadoCommand {
  constructor(private readonly repository: IRrhhRepository) {}

  async execute(ctx: RequestContext, payload: unknown): Promise<string> {
    const data = schema.parse(payload);
    const empleadoId = randomUUID();

    const empleado = EmpleadoAggregate.create(
      empleadoId,
      ctx.tenantId,
      ctx.branchId,
      {
        nombre: data.nombre,
        apellido: data.apellido,
        dni: data.dni,
        cargo: data.cargo,
        departamento: data.departamento,
        estado: 'ACTIVO',
        userId: data.userId
      }
    );

    await this.repository.saveEmpleado(ctx, empleado);
    return empleadoId;
  }
}
