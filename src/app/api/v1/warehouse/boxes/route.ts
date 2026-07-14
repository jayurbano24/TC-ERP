import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { enrichWarehouseBoxItems } from '@/shared/infrastructure/warehouse/enrichWarehouseBoxItems';
import { isBodegaOperationalRack } from '@/lib/database/warehouse';

const ListBoxesQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  search: z.string().trim().max(100).optional(),
  fillStatus: z.enum(['partial', 'full', 'all']).optional(),
});

function isMissingRpcError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST202' ||
    error.code === '42883' ||
    !!error.message?.includes('warehouse_list_boxes_page') ||
    !!error.message?.includes('warehouse_list_partial_boxes') ||
    !!error.message?.includes('Could not find the function')
  );
}

function onlyBodegaRows<T extends { rack?: string | null }>(rows: T[]): T[] {
  return rows.filter((row) => isBodegaOperationalRack(row.rack));
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  if (!supabase) {
    return NextResponse.json(
      { error: 'SERVER_CLIENT_REQUIRED' },
      { status: 500 }
    );
  }

  const roleCheck = await logOnlyRoleCheck(req, ROLES_BODEGA_DESPACHO, { module: 'bodega', action: 'list_boxes' });
  if (roleCheck) return roleCheck;

  const parsed = ListBoxesQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 422 });
  }

  const { cursor, limit, search, fillStatus } = parsed.data;
  const fillParam = !fillStatus || fillStatus === 'all' ? null : fillStatus;

  // Camino dedicado: tarjeta "Cajas en Proceso" (TMP / EN_PROCESO)
  if (fillParam === 'partial' && !cursor && !search) {
    const inProgress = await supabase.rpc('warehouse_list_in_progress_boxes', {
      p_limit: limit + 1,
    });
    if (!inProgress.error && (inProgress.data?.length ?? 0) > 0) {
      const rows = onlyBodegaRows(inProgress.data ?? []);
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const enriched = await enrichWarehouseBoxItems(supabase, items);
      return NextResponse.json({
        items: enriched,
        nextCursor: hasMore ? enriched[enriched.length - 1]?.box_id : null,
      });
    }

    const partialRpc = await supabase.rpc('warehouse_list_partial_boxes', {
      p_limit: limit + 1,
    });
    if (!partialRpc.error) {
      const rows = onlyBodegaRows(partialRpc.data ?? []);
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const enriched = await enrichWarehouseBoxItems(supabase, items);
      return NextResponse.json({
        items: enriched,
        nextCursor: hasMore ? enriched[enriched.length - 1]?.box_id : null,
      });
    }
    if (!isMissingRpcError(partialRpc.error) && !isMissingRpcError(inProgress.error)) {
      console.error('Error in GET /api/v1/warehouse/boxes (partial):', partialRpc.error || inProgress.error);
      return NextResponse.json({
        error: 'QUERY_FAILED: ' + (partialRpc.error || inProgress.error)?.message,
      }, { status: 500 });
    }
  }

  let { data, error } = await supabase.rpc('warehouse_list_boxes_page', {
    p_cursor: cursor ?? null,
    p_limit: limit + 1,
    p_search: search ?? null,
    p_fill_status: fillParam,
  });

  // Compat: overload 4 args aún no aplicada → firma de 3 args
  if (error && isMissingRpcError(error)) {
    const legacy = await supabase.rpc('warehouse_list_boxes_page', {
      p_cursor: cursor ?? null,
      p_limit: limit + 1,
      p_search: search ?? null,
    });
    data = legacy.data;
    error = legacy.error;
  }

  if (error && isMissingRpcError(error)) {
    let q = supabase
      .from('warehouse_box_summary')
      .select('box_id, rack, label, series_count, sample_status, sample_brand_id, sample_model_id, sample_service_order_id, last_movement_at')
      .order('box_id', { ascending: true })
      .limit(limit + 1);

    if (cursor) q = q.gt('box_id', cursor);
    if (search) q = q.or(`rack.ilike.%${search}%,label.ilike.%${search}%`);

    const fallback = await q;
    if (fallback.error) {
      console.error('Error in GET /api/v1/warehouse/boxes:', fallback.error);
      return NextResponse.json({ error: 'QUERY_FAILED: ' + fallback.error.message }, { status: 500 });
    }
    const rowsFb = onlyBodegaRows(fallback.data ?? []);
    const hasMoreFb = rowsFb.length > limit;
    const itemsFb = hasMoreFb ? rowsFb.slice(0, -1) : rowsFb;
    const enrichedFb = await enrichWarehouseBoxItems(supabase, itemsFb);
    return NextResponse.json({
      items: enrichedFb,
      nextCursor: hasMoreFb ? enrichedFb[enrichedFb.length - 1]?.box_id : null,
      migrationHint: fillParam === 'partial' ? '129_warehouse_list_boxes_fill_status' : undefined,
    });
  }

  if (error) {
    console.error('Error in GET /api/v1/warehouse/boxes:', error);
    return NextResponse.json({ error: 'QUERY_FAILED: ' + error.message }, { status: 500 });
  }

  const rows = onlyBodegaRows(data ?? []);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, -1) : rows;
  const enriched = await enrichWarehouseBoxItems(supabase, items);

  return NextResponse.json({
    items: enriched,
    nextCursor: hasMore ? enriched[enriched.length - 1]?.box_id : null,
  });
}
