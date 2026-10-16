import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  ROLES_PREDIAGNOSTICO_WRITE,
  ROLES_RECEPCION,
  userHasAnyOperationalRole,
} from '@/shared/authz/roleGuard';
import { savePrediagnostico } from '@/modules/backoffice/prediagnostico/prediagnosticoService';
import { createPrediagnosticoStore } from '@/modules/backoffice/prediagnostico/supabasePrediagnosticoStore';
import { loadPrediagnosticoMotorCatalog } from '@/modules/backoffice/prediagnostico/loadPrediagnosticoMotorCatalog';

const Query = z.object({
  serviceOrderId: z.string().uuid().optional(),
  techId: z.string().optional(),
  brandId: z.string().optional(),
  modelId: z.string().uuid().optional(),
});

const Body = z.object({
  serviceOrderId: z.string().uuid(),
  shellClass: z.string().nullable(),
  cosmetics: z.record(z.string(), z.string()).default({}),
  functionChecks: z.record(z.string(), z.string()).default({}),
  verdict: z.string().nullable(),
  notes: z.string().max(2000).default(''),
});

function actorName(user: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const meta = user.user_metadata || {};
  const full = typeof meta.full_name === 'string' ? meta.full_name : '';
  const name = typeof meta.name === 'string' ? meta.name : '';
  return full || name || user.email || 'Usuario';
}

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Orden de servicio no válida' }, { status: 400 });
    }

    const db = getSupabaseServerClient();
    const store = createPrediagnosticoStore(db);
    const techId = parsed.data.techId || '';
    const brandId = parsed.data.brandId || '';
    const modelId = parsed.data.modelId || '';

    const [item, motorCatalog, canEdit] = await Promise.all([
      parsed.data.serviceOrderId ? store.findByServiceOrder(parsed.data.serviceOrderId) : Promise.resolve(null),
      loadPrediagnosticoMotorCatalog(db, { techId, brandId, modelId }),
      userHasAnyOperationalRole(auth.user.id, ROLES_PREDIAGNOSTICO_WRITE),
    ]);

    return NextResponse.json({ item, items: motorCatalog.items, canEdit });
  },
  { module: 'backoffice', action: 'prediagnostico.read', roles: ROLES_RECEPCION }
);

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const canEdit = await userHasAnyOperationalRole(auth.user.id, ROLES_PREDIAGNOSTICO_WRITE);
    if (!canEdit) {
      return NextResponse.json(
        { error: 'Solo backoffice/CAC puede guardar el prediagnóstico.' },
        { status: 403 }
      );
    }

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos del prediagnóstico no válidos' }, { status: 400 });
    }

    const saved = await savePrediagnostico(
      createPrediagnosticoStore(getSupabaseServerClient()),
      { userId: auth.user.id, userName: actorName(auth.user) },
      parsed.data
    );
    return NextResponse.json({ item: saved });
  },
  { module: 'backoffice', action: 'prediagnostico.save', roles: ROLES_PREDIAGNOSTICO_WRITE }
);
