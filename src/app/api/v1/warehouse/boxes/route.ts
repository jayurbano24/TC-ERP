import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { enrichWarehouseBoxItems } from '@/shared/infrastructure/warehouse/enrichWarehouseBoxItems';

const ListBoxesQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  search: z.string().trim().max(100).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  // Si se accedió vía Bearer sin RLS en `supabase`, retornamos 500 por seguridad,
  // ya que este endpoint requiere que la vista respete RLS del usuario actual.
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

  const { cursor, limit, search } = parsed.data;

  const { data, error } = await supabase.rpc('warehouse_list_boxes_page', {
    p_cursor: cursor ?? null,
    p_limit: limit + 1,
    p_search: search ?? null,
  });

  if (
    error &&
    (error.message?.includes('warehouse_list_boxes_page') ||
      error.code === '42883' ||
      error.code === 'PGRST202')
  ) {
    // Fallback si la migración 069 no está aplicada aún
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
    const hasMoreFb = (fallback.data?.length ?? 0) > limit;
    const itemsFb = hasMoreFb ? fallback.data!.slice(0, -1) : fallback.data ?? [];
    const enrichedFb = await enrichWarehouseBoxItems(supabase, itemsFb);
    return NextResponse.json({
      items: enrichedFb,
      nextCursor: hasMoreFb ? enrichedFb[enrichedFb.length - 1]?.box_id : null,
    });
  }

  if (error) {
    console.error('Error in GET /api/v1/warehouse/boxes:', error);
    return NextResponse.json({ error: 'QUERY_FAILED: ' + error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, -1) : rows;
  const enriched = await enrichWarehouseBoxItems(supabase, items);

  return NextResponse.json({
    items: enriched,
    nextCursor: hasMore ? enriched[enriched.length - 1]?.box_id : null,
  });
}
