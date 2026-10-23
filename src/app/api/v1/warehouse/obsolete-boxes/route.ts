import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  enrichWarehouseBoxItems,
  type WarehouseBoxListRow,
} from '@/shared/infrastructure/warehouse/enrichWarehouseBoxItems';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  search: z.string().trim().max(100).optional(),
});

/** Inventario de cajas que PX clasificÃ³ explÃ­citamente como obsoletas. */
export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  const roleCheck = await logOnlyRoleCheck(req, ROLES_BODEGA_DESPACHO, {
    module: 'bodega',
    action: 'list_obsolete_boxes',
  });
  if (roleCheck) return roleCheck;

  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 422 });
  }

  const db = getSupabaseServerClient();
  const { limit, search } = parsed.data;
  let query = db
    .from('boxes')
    .select('id, box_code, rack_location, capacity, created_at, brand_id, model_id')
    .eq('rack_location', 'OBSOLETO')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (search) {
    const safe = search.replace(/[%_,()]/g, '');
    query = query.ilike('box_code', `%${safe}%`);
  }

  const { data: boxes, error } = await query;
  if (error) return NextResponse.json({ error: `QUERY_FAILED: ${error.message}` }, { status: 500 });
  if (!boxes?.length) return NextResponse.json({ items: [] });

  const ids = boxes.map((box) => String(box.id));
  const { data: series, error: seriesError } = await db
    .from('series')
    .select('id, current_box_id, brand_id, model_id, service_order_id')
    .in('current_box_id', ids);
  if (seriesError) return NextResponse.json({ error: `QUERY_FAILED: ${seriesError.message}` }, { status: 500 });

  type SeriesRow = {
    id: string;
    current_box_id: string;
    brand_id: string | null;
    model_id: string | null;
    service_order_id: string | null;
  };
  const stats = new Map<string, { count: number; os: Set<string>; sample: SeriesRow }>();
  for (const row of (series ?? []) as SeriesRow[]) {
    const key = String(row.current_box_id);
    const current = stats.get(key) ?? { count: 0, os: new Set<string>(), sample: row };
    current.count += 1;
    current.os.add(String(row.service_order_id || row.id));
    stats.set(key, current);
  }

  const candidates: WarehouseBoxListRow[] = boxes.map((box) => {
    const stat = stats.get(String(box.id));
    return {
      box_id: String(box.id),
      label: box.box_code as string | null,
      rack: box.rack_location as string | null,
      capacity: box.capacity as number | null,
      series_count: stat?.count ?? 0,
      equipos_count: stat?.os.size ?? 0,
      sample_brand_id: stat?.sample?.brand_id ?? box.brand_id ?? null,
      sample_model_id: stat?.sample?.model_id ?? box.model_id ?? null,
      sample_service_order_id: stat?.sample?.service_order_id ?? null,
      last_movement_at: box.created_at as string | null,
    };
  });

  return NextResponse.json({ items: await enrichWarehouseBoxItems(db, candidates) });
}
