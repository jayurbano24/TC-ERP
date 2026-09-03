import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { withErrorHandler } from '@/shared/infrastructure/http/apiHandler';
import { ROLES_BODEGA_DESPACHO, ROLES_TALLER } from '@/shared/authz/roleGuard';
import { listPartsCatalog, upsertPartsCatalog } from '@/modules/parts/server/partsService';

const PostBody = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  category: z.string().max(120).optional().nullable(),
  brand_id: z.string().uuid().optional().nullable(),
  model_id: z.string().uuid().optional().nullable(),
  manufacturer: z.string().max(200).optional().nullable(),
  part_number: z.string().max(120).optional().nullable(),
  uom: z.string().max(20).optional(),
  standard_cost: z.number().nonnegative().optional(),
  internal_price: z.number().nonnegative().optional(),
  stock_min: z.number().int().nonnegative().optional(),
  stock_max: z.number().int().nonnegative().optional(),
  reorder_point: z.number().int().nonnegative().optional(),
  lead_time_days: z.number().int().nonnegative().optional(),
  requires_return: z.boolean().optional(),
  primary_supplier: z.string().max(200).optional().nullable(),
  active: z.boolean().optional(),
});

export const GET = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const sp = new URL(req.url).searchParams;
    const items = await listPartsCatalog(undefined, {
      q: sp.get('q') || undefined,
      brandId: sp.get('brandId') || undefined,
      modelId: sp.get('modelId') || undefined,
      activeOnly: sp.get('activeOnly') !== '0',
    });
    return NextResponse.json({ items });
  },
  { module: 'parts', action: 'catalog_list', roles: [...ROLES_BODEGA_DESPACHO, ...ROLES_TALLER] }
);

export const POST = withErrorHandler(
  async (req: Request) => {
    const auth = await requireApiUser(req);
    if (auth instanceof NextResponse) return auth;
    const parsed = PostBody.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 400 });
    }
    const item = await upsertPartsCatalog(parsed.data);
    return NextResponse.json({ item });
  },
  { module: 'parts', action: 'catalog_upsert', roles: ROLES_BODEGA_DESPACHO }
);
