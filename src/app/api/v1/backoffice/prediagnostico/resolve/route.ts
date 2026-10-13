import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { ROLES_RECEPCION } from '@/shared/authz/roleGuard';
import { resolvePrediagnosticoBySerials } from '@/modules/backoffice/prediagnostico/resolvePrediagnosticoBySerials';

const Query = z.object({
  serials: z.string().min(1).max(800),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Series no válidas' }, { status: 400 });
    }

    const tokens = parsed.data.serials
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 25);

    const rows = await resolvePrediagnosticoBySerials(getSupabaseServerClient(), tokens);
    return NextResponse.json({ rows });
  },
  { module: 'backoffice', action: 'prediagnostico.resolve', roles: ROLES_RECEPCION }
);
