import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';

const ListBoxSeriesQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ boxId: string }> }) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;
  const { user, supabase } = auth;

  // Si se accedió vía Bearer sin RLS en `supabase`, retornamos 500 por seguridad
  if (!supabase) {
    return NextResponse.json(
      { error: 'SERVER_CLIENT_REQUIRED' },
      { status: 500 }
    );
  }

  // Verifica autorización
  const roleCheck = await logOnlyRoleCheck(req, ROLES_BODEGA_DESPACHO, { module: 'bodega', action: 'read_box_series' });
  if (roleCheck) return roleCheck;

  const { boxId } = await params; // Next 15+ requiere await de params

  const parsed = ListBoxSeriesQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 422 });
  }

  const { cursor, limit } = parsed.data;

  // 1) Fetch series belonging to the box
  let q = supabase
    .from('series')
    .select('id, serial_number, current_status, current_reception_id, service_order_id, model_id, brand_id, material, valuation, notes, sap_status, created_at')
    .eq('current_box_id', boxId)
    .order('id', { ascending: true })
    .limit(limit + 1);

  if (cursor) {
    q = q.gt('id', cursor);
  }

  const { data: rawSeries, error: seriesError } = await q;
  if (seriesError) {
    console.error('Error in GET /api/v1/warehouse/boxes/[boxId]/series:', seriesError);
    return NextResponse.json({ error: 'QUERY_FAILED: ' + seriesError.message }, { status: 500 });
  }

  const hasMore = rawSeries.length > limit;
  const items = hasMore ? rawSeries.slice(0, -1) : rawSeries;

  if (items.length === 0) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  // 2) Batch fetch relations (receptions, service_orders, models)
  const recIds = [...new Set(items.map((s) => s.current_reception_id).filter(Boolean))];
  const osIds = [...new Set(items.map((s) => s.service_order_id).filter(Boolean))];
  const modelIds = [...new Set(items.map((s) => s.model_id).filter(Boolean))];

  const fetchMap = async (table: string, ids: string[], cols: string) => {
    const map = new Map<string, any>();
    if (ids.length === 0) return map;
    const chunkSize = 80;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data, error } = await supabase.from(table).select(cols).in('id', chunk);
      if (error) {
        console.error(`Error batch fetching from ${table}:`, error);
        continue;
      }
      for (const row of data || []) map.set((row as any).id, row);
    }
    return map;
  };

  const [recMap, osMap, modelMap] = await Promise.all([
    fetchMap('receptions', recIds, 'id, guide_number, notes, carrier, received_by, status, created_at, source'),
    fetchMap('service_orders', osIds, 'id, os_label, reentry_count, sap_integration_status'),
    fetchMap('models', modelIds, 'id, name, technology_id, brand_id'),
  ]);

  // 3) Resolve brands + technologies for models
  const brandIds = [
    ...new Set([
      ...items.map((s) => s.brand_id).filter(Boolean),
      ...Array.from(modelMap.values()).map((m) => m.brand_id).filter(Boolean),
    ]),
  ];
  const techIds = [...new Set(Array.from(modelMap.values()).map((m) => m.technology_id).filter(Boolean))];
  const [brandMap, techMap] = await Promise.all([
    fetchMap('brands', brandIds, 'id, name'),
    fetchMap('technologies', techIds, 'id, name'),
  ]);

  for (const m of modelMap.values()) {
    if (m.technology_id) {
      m.technologies = techMap.get(m.technology_id) || null;
    }
    if (m.brand_id) {
      m.brands = brandMap.get(m.brand_id) || null;
    }
  }

  // 4) Attach relations to each series
  for (const s of items) {
    s.receptions = s.current_reception_id ? recMap.get(s.current_reception_id) || null : null;
    s.service_orders = s.service_order_id ? osMap.get(s.service_order_id) || null : null;
    s.models = s.model_id ? modelMap.get(s.model_id) || null : null;
    const brandId = s.brand_id || s.models?.brand_id;
    s.brands = brandId ? brandMap.get(brandId) || null : null;
  }

  return NextResponse.json({
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}
