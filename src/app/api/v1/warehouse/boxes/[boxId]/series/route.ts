import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const ListBoxSeriesQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ boxId: string }> }) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  const roleCheck = await logOnlyRoleCheck(req, ROLES_BODEGA_DESPACHO, {
    module: 'bodega',
    action: 'read_box_series',
  });
  if (roleCheck) return roleCheck;

  const { boxId } = await params;

  const parsed = ListBoxSeriesQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'VALIDATION_ERROR', issues: parsed.error.flatten() }, { status: 422 });
  }

  const { cursor, limit } = parsed.data;
  // Service role: misma lectura que listado de cajas (evita RLS vacío / Bearer sin client).
  const db = getSupabaseServerClient();

  let q = db
    .from('series')
    .select(
      'id, serial_number, s2, s3, s4, current_status, current_reception_id, service_order_id, model_id, brand_id, material, valuation, notes, sap_status, created_at'
    )
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

  const rows = rawSeries ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, -1) : rows;

  if (items.length === 0) {
    return NextResponse.json({ items: [], nextCursor: null });
  }

  const recIds = [...new Set(items.map((s) => s.current_reception_id).filter(Boolean))] as string[];
  const osIds = [...new Set(items.map((s) => s.service_order_id).filter(Boolean))] as string[];
  const modelIds = [...new Set(items.map((s) => s.model_id).filter(Boolean))] as string[];

  const fetchMap = async (table: string, ids: string[], cols: string) => {
    const map = new Map<string, Record<string, unknown>>();
    if (ids.length === 0) return map;
    const chunkSize = 80;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { data, error } = await db.from(table).select(cols).in('id', chunk);
      if (error) {
        console.error(`Error batch fetching from ${table}:`, error);
        continue;
      }
      for (const row of data || []) {
        map.set(String((row as { id: string }).id), row as Record<string, unknown>);
      }
    }
    return map;
  };

  const [recMap, osMap, modelMap] = await Promise.all([
    fetchMap(
      'receptions',
      recIds,
      'id, guide_number, notes, carrier, received_by, status, created_at, source'
    ),
    fetchMap('service_orders', osIds, 'id, os_label, reentry_count, main_serial, sap_integration_status'),
    fetchMap('models', modelIds, 'id, name, technology_id, brand_id'),
  ]);

  const brandIds = [
    ...new Set(
      [
        ...items.map((s) => s.brand_id as string | null),
        ...[...modelMap.values()].map((m) => m.brand_id as string | undefined),
      ].filter(Boolean) as string[]
    ),
  ];
  const techIds = [
    ...new Set(
      [...modelMap.values()]
        .map((m) => m.technology_id as string | undefined)
        .filter(Boolean) as string[]
    ),
  ];
  const [brandMap, techMap] = await Promise.all([
    fetchMap('brands', brandIds, 'id, name'),
    fetchMap('technologies', techIds, 'id, name'),
  ]);

  for (const m of modelMap.values()) {
    if (m.technology_id) {
      m.technologies = techMap.get(String(m.technology_id)) || null;
    }
    if (m.brand_id) {
      m.brands = brandMap.get(String(m.brand_id)) || null;
    }
  }

  const enriched = items.map((s) => {
    const model = s.model_id ? modelMap.get(String(s.model_id)) || null : null;
    const brandId = s.brand_id || (model?.brand_id as string | undefined);
    return {
      ...s,
      receptions: s.current_reception_id
        ? recMap.get(String(s.current_reception_id)) || null
        : null,
      service_orders: s.service_order_id ? osMap.get(String(s.service_order_id)) || null : null,
      models: model,
      brands: brandId ? brandMap.get(String(brandId)) || null : null,
    };
  });

  return NextResponse.json({
    items: enriched,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}
