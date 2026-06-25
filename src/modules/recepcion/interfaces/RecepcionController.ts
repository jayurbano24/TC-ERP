import { injectable, inject } from 'tsyringe';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { CommandBus } from '../application/cqrs/CommandBus';
import { RequestContextBuilder } from '../../../shared/context/RequestContextBuilder';
import { FeatureFlagService } from '../../../shared/feature-flags/FeatureFlagService';
import { CreateRecepcionCommand } from '../application/commands/CreateRecepcionCommand';
import { CreateRecepcionSchema } from '../application/dto/RecepcionDTO';
import { parseJsonBody } from '../../../shared/validation/parseRequest';
import { ValidationException } from '../../../shared/errors/Exceptions';

const recepcionBodySchema = z.object({
  tipo: z.enum(['CAC', 'PX']),
  payload: CreateRecepcionSchema,
});

@injectable()
export class RecepcionController {
  constructor(
    @inject('CommandBus') private readonly commandBus: CommandBus,
    @inject('FeatureFlagService') private readonly featureFlagService: FeatureFlagService
  ) {}

  async handle(request: Request) {
    try {
      const body = await parseJsonBody(request, recepcionBodySchema);

      const ctx = new RequestContextBuilder()
        .withTenant('tenant-1')
        .withBranch('branch-1')
        .withUser('user-1')
        .build();

      const isNewModuleEnabled = await this.featureFlagService.isEnabled(ctx, 'USE_NEW_RECEPTION_MODULE');

      if (!isNewModuleEnabled) {
        return NextResponse.json(
          { error: 'El nuevo módulo de recepción no está activo' },
          { status: 403 }
        );
      }

      await this.commandBus.execute(new CreateRecepcionCommand(body.tipo, body.payload), ctx);

      return NextResponse.json({ success: true, message: 'Recepción registrada exitosamente' }, { status: 201 });

    } catch (error: unknown) {
      if (error instanceof ValidationException) {
        return NextResponse.json(
          { error: error.message, issues: error.errors },
          { status: 400 }
        );
      }
      // No exponer detalles internos al cliente; el detalle real queda en el log del servidor.
      console.error('Error en API Recepcion:', error);
      return NextResponse.json(
        { error: 'Error interno del servidor' },
        { status: 500 }
      );
    }
  }
}
