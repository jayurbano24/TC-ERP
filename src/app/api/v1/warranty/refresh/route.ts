import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { refreshWarrantyPackSnapshot } from '@/modules/warranty/server/warrantySummaryService';

export const maxDuration = 180;

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      return NextResponse.json(
        {
          error:
            'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor (Vercel/.env). Use SQL Editor: SELECT refresh_warranty_pack_snapshot();',
        },
        { status: 503 }
      );
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase no configurado' }, { status: 503 });
    }

    const result = await refreshWarrantyPackSnapshot(supabase);
    return NextResponse.json({ success: true, ...result });
  },
  { module: 'despacho', action: 'warranty_refresh', roles: ROLES_BODEGA_DESPACHO }
);
