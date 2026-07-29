import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withResolvedReadClient } from '@/shared/infrastructure/http/withResolvedReadClient';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_PRODUCCION } from '@/shared/authz/roleGuard';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { readDailyUserProductionKpis } from '@/modules/kpi-sync/server/kpiReadService';

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const timeRange = new URL(req.url).searchParams.get('timeRange') ?? 'Hoy';

    return withResolvedReadClient(auth, async () => {
      const supabase = getSupabaseServerClient();
      const kpis = await readDailyUserProductionKpis(supabase, timeRange);
      return NextResponse.json({
        source: 'kpi_usuario_etl',
        kpis,
      });
    });
  },
  { module: 'dashboard', action: 'daily_users', roles: ROLES_PRODUCCION }
);
