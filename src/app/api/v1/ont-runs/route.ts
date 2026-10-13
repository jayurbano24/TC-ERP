import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import {
  userHasAnyOperationalRole,
  ROLES_PRODUCCION,
  ROLES_TALLER,
  ROLES_BODEGA_DESPACHO,
  type OperationalRole,
} from '@/shared/authz/roleGuard';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { listOntRuns } from '@/modules/ont-runs/server/listOntRuns';
import { listOntRunsAll } from '@/modules/ont-runs/server/listOntRunsAll';

const ROLES_ONT_RUNS_READ: OperationalRole[] = [
  ...new Set<OperationalRole>([...ROLES_PRODUCCION, ...ROLES_TALLER, ...ROLES_BODEGA_DESPACHO]),
];

const ListQuery = z.object({
  q: z.string().max(120).optional(),
  from: z.string().max(10).optional(),
  to: z.string().max(10).optional(),
  verdict: z.string().max(32).optional(),
  hideNotRun: z.enum(['1']).optional(),
  deviceType: z.string().max(64).optional(),
  station: z.string().max(64).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  all: z.enum(['1']).optional(),
});

export const GET = withErrorHandler(async (req: Request) => {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  const allowed = await userHasAnyOperationalRole(auth.user.id, ROLES_ONT_RUNS_READ);
  if (!allowed) {
    return NextResponse.json({ error: 'Sin permiso para consultar corridas de laboratorio' }, { status: 403 });
  }

  const parsed = ListQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { all, page: _p, limit: _l, hideNotRun, ...rest } = parsed.data;
  const listFilters = {
    ...rest,
    page: parsed.data.page,
    limit: parsed.data.limit,
    allData: all === '1',
    hideNotRun: hideNotRun === '1' && !rest.verdict?.trim(),
  };

  if (all === '1') {
    const result = await listOntRunsAll(supabase, listFilters);
    return NextResponse.json(result);
  }

  const result = await listOntRuns(supabase, listFilters);
  return NextResponse.json(result);
});
