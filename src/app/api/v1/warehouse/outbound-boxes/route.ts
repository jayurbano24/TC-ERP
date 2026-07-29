import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import {
  enrichWarehouseBoxItems,
  type WarehouseBoxListRow,
} from '@/shared/infrastructure/warehouse/enrichWarehouseBoxItems';
import { isOutboundStagingRack } from '@/lib/database/warehouse';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const QuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  search: z.string().trim().max(100).optional(),
});

/**
 * Cajas en staging de salida/despacho (rack OUTBOUND / DESPACHO / SALIDA*).
 * No pertenecen a Gestión de Bodega Central.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  const roleCheck = await logOnlyRoleCheck(req, ROLES_BODEGA_DESPACHO, {
    module: 'bodega',
    action: 'list_outbound_boxes',
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
    .select('id, box_code, rack_location, capacity, created_at, brand_id, model_id')
    .or(
      'rack_location.eq.OUTBOUND,rack_location.eq.DESPACHO,rack_location.eq.SALIDA,rack_location.ilike.SALIDA%'
    )
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
    isOutboundStagingRack(b.rack_location as string | null)
  );
  if (staging.length === 0) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const page = staging.slice(0, limit);
  const pageIds = page.map((b) => String(b.id));

  type SeriesSample = {
    current_box_id: string;
    brand_id: string | null;
    model_id: string | null;
    service_order_id: string | null;
    id: string;
  };

  const seriesByBox = new Map<
    string,
    { sample: SeriesSample; seriesCount: number; osIds: Set<string> }
  >();

  let seriesFrom = 0;
  for (;;) {
    const { data: seriesRows, error: seriesError } = await db
      .from('series')
      .select('id, current_box_id, brand_id, model_id, service_order_id')
      .in('current_box_id', pageIds)
      .range(seriesFrom, seriesFrom + 999);
    if (seriesError) {
      return NextResponse.json({ error: 'QUERY_FAILED: ' + seriesError.message }, { status: 500 });
    }
    const chunk = (seriesRows ?? []) as SeriesSample[];
    for (const row of chunk) {
      const boxId = String(row.current_box_id);
      const prev = seriesByBox.get(boxId);
      if (!prev) {
        seriesByBox.set(boxId, {
          sample: row,
          seriesCount: 1,
          osIds: new Set([String(row.service_order_id || row.id)]),
        });
      } else {
        prev.seriesCount += 1;
        prev.osIds.add(String(row.service_order_id || row.id));
      }
    }
    if (chunk.length < 1000) break;
    seriesFrom += 1000;
  }

  const candidates: WarehouseBoxListRow[] = page.map((b) => {
    const id = String(b.id);
    const stats = seriesByBox.get(id);
    const sampleBrand = stats?.sample.brand_id ?? (b.brand_id as string | null) ?? null;
    const sampleModel = stats?.sample.model_id ?? (b.model_id as string | null) ?? null;
    return {
      box_id: id,
      rack: b.rack_location as string | null,
      label: b.box_code as string | null,
      capacity: b.capacity as number | null,
      series_count: stats?.seriesCount ?? 0,
      equipos_count: stats?.osIds.size ?? 0,
      sample_brand_id: sampleBrand,
      sample_model_id: sampleModel,
      sample_service_order_id: stats?.sample.service_order_id ?? null,
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
