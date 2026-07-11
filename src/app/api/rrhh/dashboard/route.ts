import 'reflect-metadata';
import { NextResponse } from 'next/server';
import { GetRendimientoTecnicosQuery } from '../../../../modules/rrhh/application/queries/GetRendimientoTecnicosQuery';
import { RequestContextBuilder } from '../../../../shared/context/RequestContextBuilder';
import { FeatureFlagService } from '../../../../shared/feature-flags/FeatureFlagService';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withResolvedReadClient } from '@/shared/infrastructure/http/withResolvedReadClient';
import { authorize } from '@/shared/authz/authorize';
import { AUTHZ_MODULE } from '@/shared/authz/modules';
import { container } from '../../../../shared/di/container';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(request);
    if (auth instanceof NextResponse) return auth;

    const denied = await authorize(request, auth.user.id, AUTHZ_MODULE.DASHBOARD, 'view');
    if (denied) return denied;

    return withResolvedReadClient(auth, async () => {
      const query = container.resolve(GetRendimientoTecnicosQuery);
      const featureFlagService = container.resolve(FeatureFlagService);

      const { searchParams } = new URL(request.url);
      const mes = parseInt(searchParams.get('mes') || (new Date().getMonth() + 1).toString());
      const anio = parseInt(searchParams.get('anio') || new Date().getFullYear().toString());

      const ctx = new RequestContextBuilder()
        .withTenant('tenant-1')
        .withBranch('branch-1')
        .withUser(auth.user.id)
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
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('Error en API RRHH Dashboard:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
