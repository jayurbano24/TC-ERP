import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withResolvedReadClient } from '@/shared/infrastructure/http/withResolvedReadClient';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_PRODUCCION } from '@/shared/authz/roleGuard';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { readPipelineFromKpi } from '@/modules/kpi-sync/server/kpiReadService';

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    return withResolvedReadClient(auth, async () => {
      const supabase = getSupabaseServerClient();
      const pipeline = await readPipelineFromKpi(supabase);

      if (!pipeline) {
        return NextResponse.json({ source: 'empty', pipeline: null }, { status: 200 });
      }

      return NextResponse.json({ source: 'kpi_projection', pipeline });
    });
  },
  { module: 'dashboard', action: 'pipeline', roles: ROLES_PRODUCCION }
);
