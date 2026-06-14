import 'reflect-metadata';
import { NextResponse } from 'next/server';
import { GetRendimientoTecnicosQuery } from '../../../../modules/rrhh/application/queries/GetRendimientoTecnicosQuery';
import { RequestContextBuilder } from '../../../../shared/context/RequestContextBuilder';
import { FeatureFlagService } from '../../../../shared/feature-flags/FeatureFlagService';
import prisma from '../../../../infrastructure/database/prisma/client';

import { container } from '../../../../shared/di/container';

export async function GET(request: Request) {
  try {
    const query = new GetRendimientoTecnicosQuery();
    const featureFlagService = container.resolve(FeatureFlagService);

    const { searchParams } = new URL(request.url);
    const mes = parseInt(searchParams.get('mes') || (new Date().getMonth() + 1).toString());
    const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString());

    const ctx = new RequestContextBuilder()
      .withTenant('tenant-1')
      .withBranch('branch-1')
      .withUser('user-1')
      .build();

    const isNewModuleEnabled = await featureFlagService.isEnabled(ctx, 'USE_NEW_RRHH_MODULE');

    if (!isNewModuleEnabled) {
      return NextResponse.json(
        { error: 'El nuevo módulo de RRHH no está activo' },
        { status: 403 }
      );
    }

    const data = await query.execute(ctx, mes, anio);
    
    return NextResponse.json({ success: true, data }, { status: 200 });

  } catch (error: any) {
    console.error('Error en API RRHH Dashboard:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
