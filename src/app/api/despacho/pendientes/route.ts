import { NextResponse } from 'next/server';
import { GetDespachosPendientesQuery } from '../../../../modules/despacho/application/queries/GetDespachosPendientesQuery';
import { RequestContextBuilder } from '../../../../shared/context/RequestContextBuilder';
import { FeatureFlagService } from '../../../../shared/feature-flags/FeatureFlagService';
import prisma from '../../../../infrastructure/database/prisma/client';

const query = new GetDespachosPendientesQuery();
const featureFlagService = new FeatureFlagService(prisma);

export async function GET(request: Request) {
  try {
    const ctx = new RequestContextBuilder()
      .withTenant('tenant-1')
      .withBranch('branch-1')
      .withUser('user-1')
      .build();

    const isNewModuleEnabled = await featureFlagService.isEnabled(ctx, 'USE_NEW_DESPACHO_MODULE');

    if (!isNewModuleEnabled) {
      return NextResponse.json(
        { error: 'El nuevo módulo de Despacho no está activo' },
        { status: 403 }
      );
    }

    const data = await query.execute(ctx);
    
    return NextResponse.json({ success: true, data }, { status: 200 });

  } catch (error: any) {
    console.error('Error en API Despacho Pendientes:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
