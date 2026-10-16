import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { computeWarrantySummary } from '@/modules/warranty/server/warrantySummaryService';

export const maxDuration = 180;

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const summary = await computeWarrantySummary(supabase);
    return NextResponse.json(summary);
  },
  { module: 'despacho', action: 'warranty_summary', roles: ROLES_BODEGA_DESPACHO }
);
