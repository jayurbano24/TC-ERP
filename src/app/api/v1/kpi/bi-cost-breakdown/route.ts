import { NextResponse } from 'next/server';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withResolvedReadClient } from '@/shared/infrastructure/http/withResolvedReadClient';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_PRODUCCION } from '@/shared/authz/roleGuard';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { computeBICostBreakdown } from '@/modules/kpi-sync/server/biCostBreakdown';

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const timeRange = new URL(req.url).searchParams.get('timeRange') ?? 'Este Mes';

    return withResolvedReadClient(auth, async () => {
      // Service role: erp_audit_logs suele estar bloqueado por RLS al cliente browser.
      const supabase = getSupabaseServerClient();
      const result = await computeBICostBreakdown(supabase, timeRange);
      return NextResponse.json({
        rows: result.rows,
        source: result.source,
        countedOs: result.countedOs,
        timeRange,
      });
    });
  },
  { module: 'dashboard', action: 'bi_cost_breakdown', roles: ROLES_PRODUCCION }
);
