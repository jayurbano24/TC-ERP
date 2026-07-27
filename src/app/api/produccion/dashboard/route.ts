import 'reflect-metadata';
import { NextResponse } from 'next/server';
import { GetProduccionDashboardQuery } from '../../../../modules/produccion/application/queries/GetProduccionDashboardQuery';
import { RequestContextBuilder } from '../../../../shared/context/RequestContextBuilder';
import { FeatureFlagService } from '../../../../shared/feature-flags/FeatureFlagService';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withResolvedReadClient } from '@/shared/infrastructure/http/withResolvedReadClient';
import { authorize } from '@/shared/authz/authorize';
import { AUTHZ_MODULE } from '@/shared/authz/modules';
import { QueryBus } from '../../../../modules/recepcion/application/cqrs/QueryBus';
import { container } from '../../../../shared/di/container';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const auth = await requireApiUser(request);
    if (auth instanceof NextResponse) return auth;

    const denied = await authorize(request, auth.user.id, AUTHZ_MODULE.TALLER, 'view');
    if (denied) return denied;

    return withResolvedReadClient(auth, async () => {
      const queryBus = container.resolve(QueryBus);
      const featureFlagService = container.resolve(FeatureFlagService);

      const ctx = new RequestContextBuilder()
        .withTenant('tenant-1')
        .withBranch('branch-1')
        .withUser(auth.user.id)
        .build();

      const isNewDashboardEnabled = await featureFlagService.isEnabled(ctx, 'USE_NEW_PROD_DASHBOARD');

      // Strangler fig opcional: si el flag no está activo, 200 (no 403) para no
      // ensuciar la consola del navegador ni parecer un fallo de autorización.
      if (!isNewDashboardEnabled) {
        return NextResponse.json(
          { success: true, enabled: false, data: null },
          { status: 200 }
        );
      }

      const data = await queryBus.execute(new GetProduccionDashboardQuery(), ctx);
      return NextResponse.json({ success: true, enabled: true, data }, { status: 200 });
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    console.error('Error en API Produccion Dashboard:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
