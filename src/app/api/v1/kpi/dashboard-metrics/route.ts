import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withResolvedReadClient } from '@/shared/infrastructure/http/withResolvedReadClient';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_PRODUCCION } from '@/shared/authz/roleGuard';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { readDashboardMetricsFromKpi, readProductionByTechnology } from '@/modules/kpi-sync/server/kpiReadService';

const EMPTY_METRICS = {
  totalProduction: 0,
  activeTechnicians: 0,
  errorRate: 0,
  productionByBrand: [] as { name: string; count: number }[],
};

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const timeRange = new URL(req.url).searchParams.get('timeRange') ?? 'Hoy';

    return withResolvedReadClient(auth, async () => {
      const supabase = getSupabaseServerClient();
      const projected = await readDashboardMetricsFromKpi(supabase, timeRange);
      const productionByBrand = await readProductionByTechnology(supabase, timeRange);

      if (projected) {
        return NextResponse.json({
          source: 'kpi_projection',
          metrics: {
            ...projected,
            productionByBrand:
              productionByBrand.length > 0 ? productionByBrand : projected.productionByBrand,
          },
        });
      }

      if (productionByBrand.length > 0) {
        return NextResponse.json({
          source: 'series_technology',
          metrics: { ...EMPTY_METRICS, productionByBrand },
        });
      }

      return NextResponse.json({ source: 'empty', metrics: EMPTY_METRICS });
    });
  },
  { module: 'dashboard', action: 'metrics', roles: ROLES_PRODUCCION }
);
