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
import { filterPrediagnosticoCatalogForEquipment } from '@/modules/backoffice/prediagnostico/resolvePrediagnosticoCatalog';

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
    const [item, catalog, canEdit] = await Promise.all([
      parsed.data.serviceOrderId ? store.findByServiceOrder(parsed.data.serviceOrderId) : Promise.resolve(null),
      db
        .from('cat_prediagnostico_items')
        .select('id, name, item_kind, technology_ids, brand_ids, sort_order')
        .eq('active', true)
        .order('sort_order'),
      userHasAnyOperationalRole(auth.user.id, ROLES_PREDIAGNOSTICO_WRITE),
    ]);

    if (catalog.error) {
      return NextResponse.json(
        { error: 'Falta aplicar la migración 251_prediagnostico.sql en Supabase.' },
        { status: 503 }
      );
    }

    const techId = parsed.data.techId || '';
    const brandId = parsed.data.brandId || '';
    const modelId = parsed.data.modelId || '';

    let modelProfileItemIds: string[] | null = null;
    if (modelId) {
      const profile = await db
        .from('cat_prediagnostico_model_items')
        .select('item_id')
        .eq('model_id', modelId);
      if (profile.error) {
        return NextResponse.json(
          { error: 'Falta aplicar la migración 253_prediagnostico_model_items.sql en Supabase.' },
          { status: 503 }
        );
      }
      if ((profile.data || []).length > 0) {
        modelProfileItemIds = (profile.data || []).map((row) => String(row.item_id));
      }
    }

    const catalogRows = (catalog.data || []).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      kind: String(row.item_kind) as 'cosmetico' | 'funcionamiento',
      technologyIds: (row.technology_ids as string[]) || [],
      brandIds: (row.brand_ids as string[]) || [],
      sortOrder: Number(row.sort_order) || 0,
    }));

    const items = filterPrediagnosticoCatalogForEquipment(
      catalogRows,
      techId,
      brandId,
      modelProfileItemIds
    ).map(({ id, name, kind }) => ({ id, name, kind }));

    return NextResponse.json({ item, items, canEdit });
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
