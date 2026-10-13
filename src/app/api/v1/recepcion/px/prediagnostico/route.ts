import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  ROLES_PREDIAGNOSTICO_WRITE,
  ROLES_RECEPCION,
  userHasAnyOperationalRole,
  type OperationalRole,
} from '@/shared/authz/roleGuard';
import { filterPrediagnosticoCatalogForEquipment } from '@/modules/backoffice/prediagnostico/resolvePrediagnosticoCatalog';
import {
  listPxEquipmentPrediagnosticoFlags,
  loadPxEquipmentPrediagnostico,
  savePxEquipmentPrediagnosticoBatch,
} from '@/modules/recepcion/server/pxEquipmentPrediagnosticoService';

const ROLES_PX_PREDIAG_WRITE: OperationalRole[] = [...ROLES_PREDIAGNOSTICO_WRITE, 'receptor_px'];

const GetQuery = z.object({
  equipmentIds: z.string().min(1),
  anchorEquipmentId: z.string().uuid().optional(),
  techId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
});

const PostBody = z.object({
  equipmentIds: z.array(z.string().uuid()).min(1).max(25),
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

    const parsed = GetQuery.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Parámetros no válidos' }, { status: 400 });
    }

    const equipmentIds = parsed.data.equipmentIds
      .split(/[\s,;]+/)
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 25);

    const db = getSupabaseServerClient();
    const techId = parsed.data.techId || '';
    const brandId = parsed.data.brandId || '';
    const modelId = parsed.data.modelId || '';

    let modelProfileItemIds: string[] | null = null;
    if (modelId) {
      const profile = await db
        .from('cat_prediagnostico_model_items')
        .select('item_id')
        .eq('model_id', modelId);
      if ((profile.data || []).length > 0) {
        modelProfileItemIds = (profile.data || []).map((row) => String(row.item_id));
      }
    }

    const catalog = await db
      .from('cat_prediagnostico_items')
      .select('id, name, item_kind, technology_ids, brand_ids, sort_order')
      .eq('active', true)
      .order('sort_order');

    if (catalog.error) {
      return NextResponse.json(
        { error: 'Falta aplicar migraciones de pre-diagnóstico en Supabase.' },
        { status: 503 }
      );
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

    const anchorId = parsed.data.anchorEquipmentId || equipmentIds[0] || '';
    const item = anchorId ? await loadPxEquipmentPrediagnostico(db, anchorId) : null;
    const savedIds = await listPxEquipmentPrediagnosticoFlags(db, equipmentIds);
    const canEdit = await userHasAnyOperationalRole(auth.user.id, ROLES_PX_PREDIAG_WRITE);

    return NextResponse.json({
      item,
      items,
      canEdit,
      savedEquipmentIds: [...savedIds],
    });
  },
  { module: 'recepcion-px', action: 'prediagnostico.read', roles: ROLES_RECEPCION }
);

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;

    const canEdit = await userHasAnyOperationalRole(auth.user.id, ROLES_PX_PREDIAG_WRITE);
    if (!canEdit) {
      return NextResponse.json({ error: 'Sin permiso para guardar pre-diagnóstico.' }, { status: 403 });
    }

    const parsed = PostBody.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos no válidos' }, { status: 400 });
    }

    await savePxEquipmentPrediagnosticoBatch(
      getSupabaseServerClient(),
      { userId: auth.user.id, userName: actorName(auth.user) },
      parsed.data.equipmentIds,
      parsed.data
    );

    return NextResponse.json({ ok: true });
  },
  { module: 'recepcion-px', action: 'prediagnostico.save', roles: ROLES_PX_PREDIAG_WRITE }
);
