import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import {
  enrichWarehouseBoxItems,
  type WarehouseBoxListRow,
} from '@/shared/infrastructure/warehouse/enrichWarehouseBoxItems';
import { isScrapStagingRack } from '@/lib/database/warehouse';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { aggregateScrapBoxSeriesStats } from '@/lib/api/aggregateScrapBoxSeriesStats';

const QuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  search: z.string().trim().max(100).optional(),
});

/**
 * Cajas en Bodega SCRAP (rack SCRAP / SCRAPS / SCRAP*).
 * No pertenecen a Gestión de Bodega Central.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  const roleCheck = await logOnlyRoleCheck(req, ROLES_BODEGA_DESPACHO, {
    module: 'bodega',
    action: 'list_scrap_boxes',
  });
  if (roleCheck) return roleCheck;

  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const { cursor, limit, search } = parsed.data;
  const db = getSupabaseServerClient();

  let q = db
    .from('boxes')
    .select(
      'id, box_code, rack_location, capacity, created_at, brand_id, model_id, status, is_partial_box'
    )
    .or('rack_location.eq.SCRAP,rack_location.eq.SCRAPS,rack_location.ilike.SCRAP%')
    .neq('rack_location', 'ELIMINADO')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit * 3, 400));

  if (cursor) {
    const { data: cursorBox } = await db
      .from('boxes')
      .select('created_at')
      .eq('id', cursor)
      .maybeSingle();
    if (cursorBox?.created_at) {
      q = q.lt('created_at', cursorBox.created_at);
    }
  }

  if (search) {
    const s = search.replace(/%/g, '');
    q = q.or(`box_code.ilike.%${s}%,rack_location.ilike.%${s}%`);
  }

  const { data: boxRows, error: boxesError } = await q;
  if (boxesError) {
    return NextResponse.json({ error: 'QUERY_FAILED: ' + boxesError.message }, { status: 500 });
  }

  const staging = (boxRows ?? []).filter((b) =>
    isScrapStagingRack(b.rack_location as string | null)
  );
  if (staging.length === 0) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const page = staging.slice(0, limit);
  const pageIds = page.map((b) => String(b.id));

  let seriesByBox: Awaited<ReturnType<typeof aggregateScrapBoxSeriesStats>>;
  try {
    seriesByBox = await aggregateScrapBoxSeriesStats(db, pageIds);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'series aggregate failed';
    return NextResponse.json({ error: 'QUERY_FAILED: ' + msg }, { status: 500 });
  }

  const candidates: WarehouseBoxListRow[] = page.map((b) => {
    const id = String(b.id);
    const stats = seriesByBox.get(id);
    const sampleBrand = stats?.sampleBrandId ?? (b.brand_id as string | null) ?? null;
    const sampleModel = stats?.sampleModelId ?? (b.model_id as string | null) ?? null;
    return {
      box_id: id,
      rack: b.rack_location as string | null,
      label: b.box_code as string | null,
      capacity: b.capacity as number | null,
      box_status: (b as { status?: string | null }).status ?? null,
      is_partial_box: Boolean((b as { is_partial_box?: boolean | null }).is_partial_box),
      series_count: stats?.seriesCount ?? 0,
      equipos_count: stats?.equiposCount ?? 0,
      sample_brand_id: sampleBrand,
      sample_model_id: sampleModel,
      sample_service_order_id: stats?.sampleServiceOrderId ?? null,
      last_movement_at: null,
    };
  });

  const enriched = await enrichWarehouseBoxItems(db, candidates);
  const hasMore = staging.length > limit;

  return NextResponse.json({
    items: enriched,
    nextCursor: hasMore ? enriched[enriched.length - 1]?.box_id ?? null : null,
  });
}
