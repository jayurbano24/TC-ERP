import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import { enrichWarehouseBoxItems } from '@/shared/infrastructure/warehouse/enrichWarehouseBoxItems';
import { isBodegaOperationalRack } from '@/lib/database/warehouse';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { applyAccurateEquiposToWarehouseBoxItems } from '@/lib/api/warehouseBoxListCounts';
import type { SupabaseClient } from '@supabase/supabase-js';

const ListBoxesQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  search: z.string().trim().max(100).optional(),
  fillStatus: z.enum(['partial', 'full', 'all']).optional(),
  technologyId: z.string().uuid().optional(),
  modelId: z.string().uuid().optional(),
});

const WAREHOUSE_SERIES_STATUSES = ['in_central_warehouse', 'in_control_warehouse'] as const;

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

async function finalizeWarehouseBoxList<T extends { box_id: string; capacity?: number | null; equipos_count?: number | null; series_count?: number | null }>(
  db: SupabaseClient,
  items: T[]
): Promise<T[]> {
  try {
    return await applyAccurateEquiposToWarehouseBoxItems(db, items);
  } catch (err) {
    console.warn('[warehouse/boxes] applyAccurateEquiposToWarehouseBoxItems:', err);
    return items;
  }
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

  const { cursor, limit, search, fillStatus, technologyId, modelId } = parsed.data;
  const fillParam = !fillStatus || fillStatus === 'all' ? null : fillStatus;

  // Filtro por tecnología/modelo: service role (misma vista que KPIs) + sample/counts.
  if (technologyId || modelId) {
    const db = getSupabaseServerClient();
    let modelIds: string[] = [];
    if (modelId) {
      modelIds = [modelId];
    } else if (technologyId) {
      const { data: mods, error: modsError } = await db
        .from('models')
        .select('id')
        .eq('technology_id', technologyId);
      if (modsError) {
        return NextResponse.json({ error: 'QUERY_FAILED: ' + modsError.message }, { status: 500 });
      }
      modelIds = (mods ?? []).map((m) => String(m.id));
    }

    if (modelIds.length === 0) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    const boxIdSet = new Set<string>();
    const chunkSize = 80;
    for (let i = 0; i < modelIds.length; i += chunkSize) {
      const chunk = modelIds.slice(i, i + chunkSize);
      let from = 0;
      const pageSize = 1000;
      for (;;) {
        const { data: seriesHits, error: seriesError } = await db
          .from('series')
          .select('current_box_id')
          .in('model_id', chunk)
          .in('current_status', [...WAREHOUSE_SERIES_STATUSES])
          .not('current_box_id', 'is', null)
          .range(from, from + pageSize - 1);
        if (seriesError) {
          return NextResponse.json({ error: 'QUERY_FAILED: ' + seriesError.message }, { status: 500 });
        }
        const rows = seriesHits ?? [];
        for (const row of rows) {
          if (row.current_box_id) boxIdSet.add(String(row.current_box_id));
        }
        if (rows.length < pageSize) break;
        from += pageSize;
      }
    }

    let boxIds = [...boxIdSet].sort();
    if (cursor) {
      boxIds = boxIds.filter((id) => id > cursor);
    }

    if (boxIds.length === 0) {
      return NextResponse.json({ items: [], nextCursor: null });
    }

    const pageIds = boxIds.slice(0, Math.max(limit * 3, 60));
    const { data: boxRows, error: boxesError } = await db
      .from('boxes')
      .select('id, rack_location, box_code, capacity, created_at')
      .in('id', pageIds);
    if (boxesError) {
      return NextResponse.json({ error: 'QUERY_FAILED: ' + boxesError.message }, { status: 500 });
    }

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
      const { data: seriesRows, error: seriesDetailError } = await db
        .from('series')
        .select('id, current_box_id, brand_id, model_id, service_order_id')
        .in('current_box_id', pageIds)
        .in('current_status', [...WAREHOUSE_SERIES_STATUSES])
        .range(seriesFrom, seriesFrom + 999);
      if (seriesDetailError) {
        return NextResponse.json(
          { error: 'QUERY_FAILED: ' + seriesDetailError.message },
          { status: 500 }
        );
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

    const byId = new Map((boxRows ?? []).map((b) => [String(b.id), b]));
    const candidates = onlyBodegaRows(
      pageIds
        .map((id) => {
          const b = byId.get(id);
          const stats = seriesByBox.get(id);
          if (!b || !stats) return null;
          return {
            box_id: String(b.id),
            rack: b.rack_location as string | null,
            label: b.box_code as string | null,
            capacity: b.capacity as number | null,
            series_count: stats.seriesCount,
            equipos_count: stats.osIds.size,
            sample_brand_id: stats.sample.brand_id,
            sample_model_id: stats.sample.model_id,
            sample_service_order_id: stats.sample.service_order_id,
            last_movement_at: null,
          };
        })
        .filter((x): x is NonNullable<typeof x> => Boolean(x))
    );

    let enriched = await enrichWarehouseBoxItems(db, candidates);

    if (fillParam === 'partial') {
      enriched = enriched.filter((b) => {
        const eq = Number(b.equipos_count ?? b.series_count ?? 0);
        const cap = Number(b.capacity || 0);
        return eq > 0 && eq < Math.max(cap, 1);
      });
    } else if (fillParam === 'full') {
      enriched = enriched.filter((b) => {
        const eq = Number(b.equipos_count ?? b.series_count ?? 0);
        const cap = Number(b.capacity || 0);
        return eq >= Math.max(cap, 1);
      });
    }

    if (search) {
      const term = search.toLowerCase();
      enriched = enriched.filter(
        (b) =>
          String(b.label || '').toLowerCase().includes(term) ||
          String(b.rack || '').toLowerCase().includes(term)
      );
    }

    // Si el cliente pidió tecnología, forzar technology_id (evita drop en filtro UI).
    if (technologyId) {
      enriched = enriched.map((b) => ({
        ...b,
        technology_id: b.technology_id || technologyId,
      }));
    }

    const sorted = [...enriched].sort((a, b) => String(a.box_id).localeCompare(String(b.box_id)));
    const page = sorted.slice(0, limit);
    const nextCursor = sorted.length > limit ? page[page.length - 1]?.box_id ?? null : null;
    const pageAccurate = await finalizeWarehouseBoxList(db, page);

    return NextResponse.json({
      items: pageAccurate,
      nextCursor,
    });
  }

  // «Cajas en Proceso» = solo TMP / EN_PROCESO (no incompletas por capacity 18/19).
  if (fillParam === 'partial' && !cursor && !search) {
    const inProgress = await supabase.rpc('warehouse_list_in_progress_boxes', {
      p_limit: limit + 1,
    });
    if (!inProgress.error) {
      const rows = onlyBodegaRows(inProgress.data ?? []);
      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, -1) : rows;
      const enriched = await enrichWarehouseBoxItems(supabase, items);
      const accurate = await finalizeWarehouseBoxList(supabase, enriched);
      return NextResponse.json({
        items: accurate,
        nextCursor: hasMore ? accurate[accurate.length - 1]?.box_id : null,
      });
    }
    if (!isMissingRpcError(inProgress.error)) {
      console.error('Error in GET /api/v1/warehouse/boxes (partial):', inProgress.error);
      return NextResponse.json({
        error: 'QUERY_FAILED: ' + inProgress.error?.message,
      }, { status: 500 });
    }
  }

  // Si SQL aún no excluye OUTBOUND (178/179 pendientes), el RPC trae staging primero
  // y onlyBodegaRows vacía la página. Paginar hasta llenar `limit` operativas.
  const PAGE_FETCH = Math.min(Math.max(limit + 1, 40), 200);
  const MAX_FETCH_ROUNDS = 12;
  const collected: Array<Record<string, unknown> & { box_id: string; rack?: string | null }> = [];
  let pageCursor: string | null = cursor ?? null;
  let rpcMissing = false;
  let lastError: { message?: string; code?: string } | null = null;
  let sawRawRows = false;
  let exhausted = false;

  for (let round = 0; round < MAX_FETCH_ROUNDS && collected.length <= limit; round += 1) {
    let { data, error } = await supabase.rpc('warehouse_list_boxes_page', {
      p_cursor: pageCursor,
      p_limit: PAGE_FETCH,
      p_search: search ?? null,
      p_fill_status: fillParam,
    });

    if (error && isMissingRpcError(error)) {
      const legacy = await supabase.rpc('warehouse_list_boxes_page', {
        p_cursor: pageCursor,
        p_limit: PAGE_FETCH,
        p_search: search ?? null,
      });
      data = legacy.data;
      error = legacy.error;
    }

    if (error && isMissingRpcError(error)) {
      rpcMissing = true;
      lastError = error;
      break;
    }

    if (error) {
      console.error('Error in GET /api/v1/warehouse/boxes:', error);
      return NextResponse.json({ error: 'QUERY_FAILED: ' + error.message }, { status: 500 });
    }

    const raw = (data ?? []) as Array<Record<string, unknown> & { box_id: string; rack?: string | null }>;
    if (raw.length === 0) {
      exhausted = true;
      break;
    }
    sawRawRows = true;

    const kept = onlyBodegaRows(raw);
    for (const row of kept) {
      if (collected.length > limit) break;
      if (collected.some((x) => x.box_id === row.box_id)) continue;
      collected.push(row);
    }

    const lastRaw = raw[raw.length - 1];
    pageCursor = lastRaw?.box_id ? String(lastRaw.box_id) : null;
    if (!pageCursor || raw.length < PAGE_FETCH) {
      exhausted = true;
      break;
    }
    // Si esta ronda no aportó operativas, seguir (p. ej. bloque de OUTBOUND).
    if (kept.length === 0) continue;
  }

  if (rpcMissing) {
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
    const accurateFb = await finalizeWarehouseBoxList(supabase, enrichedFb);
    return NextResponse.json({
      items: accurateFb,
      nextCursor: hasMoreFb ? accurateFb[accurateFb.length - 1]?.box_id : null,
      migrationHint: fillParam === 'partial' ? '129_warehouse_list_boxes_fill_status' : undefined,
    });
  }

  const hasMore = collected.length > limit || (sawRawRows && !exhausted && collected.length >= limit);
  const items = hasMore ? collected.slice(0, limit) : collected;
  const enriched = await enrichWarehouseBoxItems(supabase, items);
  const accurate = await finalizeWarehouseBoxList(supabase, enriched);

  return NextResponse.json({
    items: accurate,
    nextCursor: hasMore ? accurate[accurate.length - 1]?.box_id ?? null : null,
    ...(sawRawRows && accurate.length === 0
      ? { migrationHint: '197_fix_bodega_operational_rack_exclude_outbound' }
      : {}),
  });
}
