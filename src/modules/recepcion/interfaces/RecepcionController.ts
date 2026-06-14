import { injectable, inject } from 'tsyringe';
import { NextResponse } from 'next/server';
import { CommandBus } from '../application/cqrs/CommandBus';
import { RequestContextBuilder } from '../../../shared/context/RequestContextBuilder';
import { FeatureFlagService } from '../../../shared/feature-flags/FeatureFlagService';
import { CreateRecepcionCommand } from '../application/commands/CreateRecepcionCommand';

@injectable()
export class RecepcionController {
  constructor(
    @inject('CommandBus') private readonly commandBus: CommandBus,
    @inject('FeatureFlagService') private readonly featureFlagService: FeatureFlagService
  ) {}

  async handle(request: Request) {
    try {
      const body = await request.json();
      
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

      if (body.tipo !== 'CAC' && body.tipo !== 'PX') {
        return NextResponse.json({ error: 'Tipo de recepción inválido' }, { status: 400 });
      }

      await this.commandBus.execute(new CreateRecepcionCommand(body.tipo, body.payload), ctx);

      return NextResponse.json({ success: true, message: 'Recepción registrada exitosamente' }, { status: 201 });

    } catch (error: any) {
      console.error('Error en API Recepcion:', error);
      return NextResponse.json(
        { error: error.message || 'Error interno del servidor' },
        { status: 500 }
      );
    }
  }
}
