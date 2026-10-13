import { NextResponse } from 'next/server';
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
import { mapOntRunRow } from '@/modules/ont-runs/server/mapOntRunRow';

const ROLES_ONT_RUNS_READ: OperationalRole[] = [
  ...new Set<OperationalRole>([...ROLES_PRODUCCION, ...ROLES_TALLER, ...ROLES_BODEGA_DESPACHO]),
];

type RouteContext = { params: Promise<{ runId: string }> };

export const GET = withErrorHandler(async (req: Request, context: RouteContext) => {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  const allowed = await userHasAnyOperationalRole(auth.user.id, ROLES_ONT_RUNS_READ);
  if (!allowed) {
    return NextResponse.json({ error: 'Sin permiso para consultar corridas de laboratorio' }, { status: 403 });
  }

  const { runId } = await context.params;
  const id = decodeURIComponent(runId).trim();
  if (!id) {
    return NextResponse.json({ error: 'runId requerido' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('ont_runs').select('*').eq('run_id', id).maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Corrida no encontrada' }, { status: 404 });
  }

  return NextResponse.json({ row: mapOntRunRow(data as Parameters<typeof mapOntRunRow>[0]) });
});
