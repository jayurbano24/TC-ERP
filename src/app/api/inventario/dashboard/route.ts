import { NextResponse } from 'next/server';
import { GetInventarioValorizadoQuery } from '../../../../modules/inventario/application/queries/GetInventarioValorizadoQuery';
import { RequestContextBuilder } from '../../../../shared/context/RequestContextBuilder';
import { FeatureFlagService } from '../../../../shared/feature-flags/FeatureFlagService';
import prisma from '../../../../infrastructure/database/prisma/client';

const query = new GetInventarioValorizadoQuery();
const featureFlagService = new FeatureFlagService(prisma);

export async function GET(request: Request) {
  try {
    const ctx = new RequestContextBuilder()
      .withTenant('tenant-1')
      .withBranch('branch-1')
      .withUser('user-1')
      .build();

    const isNewDashboardEnabled = await featureFlagService.isEnabled(ctx, 'USE_NEW_INVENTORY_MODULE');

    if (!isNewDashboardEnabled) {
      return NextResponse.json(
        { error: 'El nuevo módulo de inventario no está activo' },
        { status: 403 }
      );
    }

    const data = await query.execute(ctx);
    
    return NextResponse.json({ success: true, data }, { status: 200 });

  } catch (error: any) {
    console.error('Error en API Inventario Dashboard:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
