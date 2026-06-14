import { NextResponse } from 'next/server';
import { container } from 'tsyringe';
import { RequestContextBuilder } from '../../../shared/context/RequestContextBuilder';
import { CrearRecepcionCacCommand } from '../../../modules/logistica/application/commands/CrearRecepcionCacCommand';
import { CrearRecepcionPxCommand } from '../../../modules/logistica/application/commands/CrearRecepcionPxCommand';
import { FeatureFlagService } from '../../../shared/feature-flags/FeatureFlagService';
// Importamos el prisma configurado para registrarlo en el container o usarlo directo.
import prisma from '../../../infrastructure/database/prisma/client';
import { PrismaOrdenServicioRepository } from '../../../modules/logistica/infrastructure/repositories/PrismaOrdenServicioRepository';
import { OrdenServicioMapper } from '../../../modules/logistica/infrastructure/mappers/OrdenServicioMapper';

// Helpers para DI (En un entorno real esto se inicializa en un archivo global)
const mapper = new OrdenServicioMapper();
const repository = new PrismaOrdenServicioRepository(prisma, mapper);
const cacCommand = new CrearRecepcionCacCommand(repository);
const pxCommand = new CrearRecepcionPxCommand(repository);
const featureFlagService = new FeatureFlagService(prisma);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Simular obtención de RequestContext (Normalmente vendría de sesión/JWT)
    const ctx = new RequestContextBuilder()
      .withTenant('tenant-1')
      .withBranch('branch-1')
      .withUser('user-1')
      .build();

    // Comprobar Feature Flag
    const isNewModuleEnabled = await featureFlagService.isEnabled(ctx, 'USE_NEW_RECEPTION_MODULE');

    if (!isNewModuleEnabled) {
      // Retornar un error amigable o redirigir lógica al código viejo si esto fuera posible en el servidor.
      // Como estamos usando Strangler Fig, la UI debería ser la que verifique este flag antes de invocar la API.
      // Pero como salvaguarda:
      return NextResponse.json(
        { error: 'El nuevo módulo de recepción no está activo' },
        { status: 403 }
      );
    }

    if (body.tipo === 'CAC') {
      await cacCommand.execute(ctx, body.payload);
    } else if (body.tipo === 'PX') {
      await pxCommand.execute(ctx, body.payload);
    } else {
      return NextResponse.json({ error: 'Tipo de recepción inválido' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Recepción registrada exitosamente' }, { status: 201 });

  } catch (error: any) {
    console.error('Error en API Recepcion:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
