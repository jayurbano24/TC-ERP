import type { SupabaseClient } from '@supabase/supabase-js';
import { isBodegaOperationalRack } from '@/lib/database/warehouse';
import {
  enrichWarehouseBoxItems,
  type EnrichedWarehouseBoxRow,
  type WarehouseBoxListRow,
} from '@/shared/infrastructure/warehouse/enrichWarehouseBoxItems';
import { buildEquipmentSerialSlots } from '@/lib/sap/equipmentSerialSlots';
import { formatWarehouseBoxId } from '@/modules/inventario/client/warehouseBoxDisplay';

export const WAREHOUSE_EXPORT_SERIES_STATUSES = [
  'in_central_warehouse',
  'in_control_warehouse',
] as const;

/** Cajas por parte al exportar series (evita Excel monolítico que tumba el request). */
export const WAREHOUSE_EXPORT_SERIES_BOXES_PER_PART = 40;

export type WarehouseExportFilters = {
  technologyId?: string;
  modelId?: string;
  search?: string;
  fillStatus?: 'partial' | 'full' | 'all' | null;
};

const PAGE = 1000;
/** Tope por parte (no del filtro completo). */
const MAX_SERIES_ROWS_PER_PART = 8000;

async function resolveModelIds(
  db: SupabaseClient,
  filters: WarehouseExportFilters
): Promise<string[] | null> {
  if (filters.modelId) return [filters.modelId];
  if (!filters.technologyId) return null;
  const { data, error } = await db
    .from('models')
    .select('id')
    .eq('technology_id', filters.technologyId);
  if (error) throw new Error(error.message || 'MODELS_QUERY_FAILED');
  return (data ?? []).map((m) => String(m.id));
}

async function collectBoxIdsForModels(
  db: SupabaseClient,
  modelIds: string[]
): Promise<string[]> {
  const boxIdSet = new Set<string>();
  const chunkSize = 80;
  for (let i = 0; i < modelIds.length; i += chunkSize) {
    const chunk = modelIds.slice(i, i + chunkSize);
    let from = 0;
    for (;;) {
      const { data, error } = await db
        .from('series')
        .select('current_box_id')
        .in('model_id', chunk)
        .in('current_status', [...WAREHOUSE_EXPORT_SERIES_STATUSES])
        .not('current_box_id', 'is', null)
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message || 'SERIES_BOX_QUERY_FAILED');
      const rows = data ?? [];
      for (const row of rows) {
        if (row.current_box_id) boxIdSet.add(String(row.current_box_id));
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }
  return [...boxIdSet].sort();
}

async function fetchAllBoxesViaRpc(
  db: SupabaseClient,
  filters: WarehouseExportFilters
): Promise<WarehouseBoxListRow[]> {
  const all: WarehouseBoxListRow[] = [];
  let cursor: string | null = null;
  const fill =
    !filters.fillStatus || filters.fillStatus === 'all' ? null : filters.fillStatus;
  const search = filters.search?.trim() || null;

  for (let page = 0; page < 50; page += 1) {
    const primary = await db.rpc('warehouse_list_boxes_page', {
      p_cursor: cursor,
      p_limit: 200,
      p_search: search,
      p_fill_status: fill,
    });
    let rpcError = primary.error;
    let pageRows: WarehouseBoxListRow[] = [];
    if (!rpcError) {
      pageRows = (primary.data ?? []) as WarehouseBoxListRow[];
    } else if (
      rpcError.message?.includes('warehouse_list_boxes_page') ||
      rpcError.code === 'PGRST202'
    ) {
      const legacy = await db.rpc('warehouse_list_boxes_page', {
        p_cursor: cursor,
        p_limit: 200,
        p_search: search,
      });
      rpcError = legacy.error;
      if (!rpcError) pageRows = (legacy.data ?? []) as WarehouseBoxListRow[];
    }
    if (rpcError) throw new Error(rpcError.message || 'LIST_BOXES_FAILED');

    const rows = pageRows.filter((r) => isBodegaOperationalRack(r.rack));
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 200) break;
    cursor = rows[rows.length - 1]?.box_id ?? null;
    if (!cursor) break;
  }
  return all;
}

async function buildCandidatesFromBoxIds(
  db: SupabaseClient,
  boxIds: string[]
): Promise<WarehouseBoxListRow[]> {
  if (boxIds.length === 0) return [];
  const candidates: WarehouseBoxListRow[] = [];
  const idChunk = 80;
  for (let i = 0; i < boxIds.length; i += idChunk) {
    const pageIds = boxIds.slice(i, i + idChunk);
    const { data: boxRows, error: boxesError } = await db
      .from('boxes')
      .select('id, rack_location, box_code, capacity, created_at')
      .in('id', pageIds);
    if (boxesError) throw new Error(boxesError.message || 'BOXES_QUERY_FAILED');

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
      const { data: seriesRows, error } = await db
        .from('series')
        .select('id, current_box_id, brand_id, model_id, service_order_id')
        .in('current_box_id', pageIds)
        .in('current_status', [...WAREHOUSE_EXPORT_SERIES_STATUSES])
        .range(seriesFrom, seriesFrom + 999);
      if (error) throw new Error(error.message || 'SERIES_DETAIL_FAILED');
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
    for (const id of pageIds) {
      const b = byId.get(id);
      const stats = seriesByBox.get(id);
      if (!b || !stats) continue;
      if (!isBodegaOperationalRack(b.rack_location as string | null)) continue;
      candidates.push({
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
      });
    }
  }
  return candidates;
}

function applyFillAndSearch(
  enriched: EnrichedWarehouseBoxRow[],
  filters: WarehouseExportFilters
): EnrichedWarehouseBoxRow[] {
  let next = enriched;
  if (filters.fillStatus === 'partial') {
    next = next.filter((b) => {
      const eq = Number(b.equipos_count ?? b.series_count ?? 0);
      const cap = Number(b.capacity || 0);
      return eq > 0 && eq < Math.max(cap, 1);
    });
  } else if (filters.fillStatus === 'full') {
    next = next.filter((b) => {
      const eq = Number(b.equipos_count ?? b.series_count ?? 0);
      const cap = Number(b.capacity || 0);
      return eq >= Math.max(cap, 1);
    });
  }
  if (filters.search?.trim()) {
    const term = filters.search.trim().toLowerCase();
    next = next.filter(
      (b) =>
        String(b.label || '').toLowerCase().includes(term) ||
        String(b.rack || '').toLowerCase().includes(term)
    );
  }
  if (filters.technologyId) {
    next = next.filter(
      (b) => !b.technology_id || b.technology_id === filters.technologyId
    );
  }
  if (filters.modelId) {
    next = next.filter(
      (b) =>
        String(b.sample_model_id || b.model_id || '') === filters.modelId
    );
  }
  return next;
}

/** Cajas de bodega operativa respetando los mismos filtros del listado. */
export async function fetchFilteredWarehouseBoxesForExport(
  db: SupabaseClient,
  filters: WarehouseExportFilters
): Promise<EnrichedWarehouseBoxRow[]> {
  const modelIds = await resolveModelIds(db, filters);
  let candidates: WarehouseBoxListRow[];

  if (modelIds) {
    if (modelIds.length === 0) return [];
    const boxIds = await collectBoxIdsForModels(db, modelIds);
    candidates = await buildCandidatesFromBoxIds(db, boxIds);
  } else {
    candidates = await fetchAllBoxesViaRpc(db, filters);
  }

  const enriched = await enrichWarehouseBoxItems(db, candidates);
  return applyFillAndSearch(enriched, filters);
}

export type WarehouseSeriesExportRow = {
  'Código Caja': string;
  Rack: string;
  Tecnología: string;
  Marca: string;
  Modelo: string;
  'Orden Servicio': string;
  'S-1': string;
  'S-2': string;
  'S-3': string;
  'S-4': string;
  Material: string;
  Valoración: string;
  Estatus: string;
};

type RawSeriesRow = {
  id: string;
  serial_number: string | null;
  material: string | null;
  valuation: string | null;
  created_at: string | null;
  current_status: string | null;
  current_box_id: string | null;
  service_order_id: string | null;
  brand_id: string | null;
  model_id: string | null;
  s2: string | null;
  s3: string | null;
  s4: string | null;
  brands?: { name?: string | null } | null;
  models?: {
    name?: string | null;
    technology_id?: string | null;
    technologies?: { name?: string | null } | null;
  } | null;
  service_orders?: {
    os_label?: string | null;
    main_serial?: string | null;
  } | null;
  boxes?: {
    box_code?: string | null;
    rack_location?: string | null;
  } | null;
};

export type WarehouseSeriesExportPage = {
  rows: WarehouseSeriesExportRow[];
  boxOffset: number;
  nextBoxOffset: number | null;
  boxesInPart: number;
  totalBoxes: number;
  done: boolean;
};

/**
 * Series (equipos) por página de cajas — una fila por OS/equipo.
 * Paginar con boxOffset para no generar un Excel monolítico.
 */
export async function fetchFilteredWarehouseSeriesForExport(
  db: SupabaseClient,
  boxes: EnrichedWarehouseBoxRow[],
  filters: WarehouseExportFilters,
  options?: { boxOffset?: number; boxLimit?: number }
): Promise<WarehouseSeriesExportPage> {
  const totalBoxes = boxes.length;
  const boxOffset = Math.max(0, options?.boxOffset ?? 0);
  const boxLimit = Math.max(
    1,
    options?.boxLimit ?? WAREHOUSE_EXPORT_SERIES_BOXES_PER_PART
  );
  const pageBoxes = boxes.slice(boxOffset, boxOffset + boxLimit);
  const boxIds = pageBoxes.map((b) => b.box_id).filter(Boolean);
  const boxLabelById = new Map(
    pageBoxes.map((b) => [
      b.box_id,
      formatWarehouseBoxId(b.label, b.box_id).primary,
    ])
  );

  if (boxIds.length === 0) {
    return {
      rows: [],
      boxOffset,
      nextBoxOffset: null,
      boxesInPart: 0,
      totalBoxes,
      done: true,
    };
  }

  const modelFilter = filters.modelId ? new Set([filters.modelId]) : null;
  let techModelIds: Set<string> | null = null;
  if (!modelFilter && filters.technologyId) {
    const ids = await resolveModelIds(db, { technologyId: filters.technologyId });
    techModelIds = new Set(ids || []);
  }

  const raw: RawSeriesRow[] = [];
  const idChunk = 40;
  for (let i = 0; i < boxIds.length; i += idChunk) {
    const chunk = boxIds.slice(i, i + idChunk);
    let from = 0;
    for (;;) {
      if (raw.length >= MAX_SERIES_ROWS_PER_PART) break;
      const { data, error } = await db
        .from('series')
        .select(
          `
          id, serial_number, material, valuation, created_at, current_status,
          current_box_id, service_order_id, brand_id, model_id, s2, s3, s4,
          brands ( name ),
          models ( name, technology_id, technologies ( name ) ),
          service_orders ( os_label, main_serial ),
          boxes ( box_code, rack_location )
        `
        )
        .in('current_box_id', chunk)
        .in('current_status', [...WAREHOUSE_EXPORT_SERIES_STATUSES])
        .order('created_at', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(error.message || 'SERIES_EXPORT_QUERY_FAILED');
      const rows = (data ?? []) as RawSeriesRow[];
      for (const row of rows) {
        if (modelFilter && !modelFilter.has(String(row.model_id || ''))) continue;
        if (
          techModelIds &&
          techModelIds.size > 0 &&
          !techModelIds.has(String(row.model_id || ''))
        ) {
          continue;
        }
        raw.push(row);
        if (raw.length >= MAX_SERIES_ROWS_PER_PART) break;
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    if (raw.length >= MAX_SERIES_ROWS_PER_PART) break;
  }

  const grouped = new Map<string, RawSeriesRow[]>();
  for (const s of raw) {
    const key = String(s.service_order_id || s.id);
    const list = grouped.get(key) || [];
    list.push(s);
    grouped.set(key, list);
  }

  const out: WarehouseSeriesExportRow[] = [];
  for (const group of grouped.values()) {
    group.sort(
      (a, b) =>
        new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );
    const main = group[0]!;
    const slots = buildEquipmentSerialSlots(
      group.map((g) => ({
        id: String(g.id),
        serial_number: g.serial_number,
        material: g.material,
        valuation: g.valuation,
        created_at: g.created_at,
        s2: g.s2,
        s3: g.s3,
        s4: g.s4,
      })),
      main.service_orders?.main_serial || null
    );
    const boxId = String(main.current_box_id || '');
    const code =
      boxLabelById.get(boxId) ||
      formatWarehouseBoxId(main.boxes?.box_code, boxId).primary;
    out.push({
      'Código Caja': code,
      Rack: String(main.boxes?.rack_location || '---'),
      Tecnología: String(main.models?.technologies?.name || '---'),
      Marca: String(main.brands?.name || '---'),
      Modelo: String(main.models?.name || '---'),
      'Orden Servicio': String(main.service_orders?.os_label || '---'),
      'S-1': String(slots.s1 || '---'),
      'S-2': String(slots.s2 || '---'),
      'S-3': String(slots.s3 || '---'),
      'S-4': String(slots.s4 || '---'),
      Material: String(main.material || '---'),
      Valoración: String(main.valuation || '---'),
      Estatus: String(main.current_status || '---'),
    });
  }

  out.sort((a, b) => {
    const c = a['Código Caja'].localeCompare(b['Código Caja'], 'es');
    if (c !== 0) return c;
    return a['Orden Servicio'].localeCompare(b['Orden Servicio'], 'es');
  });

  const nextBoxOffset = boxOffset + pageBoxes.length;
  const done = nextBoxOffset >= totalBoxes;
  return {
    rows: out,
    boxOffset,
    nextBoxOffset: done ? null : nextBoxOffset,
    boxesInPart: pageBoxes.length,
    totalBoxes,
    done,
  };
}
