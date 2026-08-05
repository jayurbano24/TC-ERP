import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import * as XLSX from 'xlsx';
import { requireApiUser } from '@/shared/infrastructure/http/requireApiUser';
import { logOnlyRoleCheck, ROLES_BODEGA_DESPACHO } from '@/shared/authz/roleGuard';
import {
  enrichWarehouseBoxItems,
  type WarehouseBoxListRow,
} from '@/shared/infrastructure/warehouse/enrichWarehouseBoxItems';
import { isOutboundStagingRack } from '@/lib/database/warehouse';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import {
  buildEquipmentSerialSlots,
  coalesceMaterialLote,
  type SerialPickRow,
} from '@/lib/sap/equipmentSerialSlots';

export const maxDuration = 120;

const QuerySchema = z.object({
  boxIds: z
    .string()
    .min(1)
    .max(8000)
    .transform((s) =>
      s
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid()).min(1).max(80)),
});

type SeriesRow = SerialPickRow & {
  current_status: string | null;
  service_order_id: string | null;
  model_id: string | null;
  brand_id: string | null;
  sap_status: string | null;
  current_box_id?: string | null;
};

async function fetchAllSeriesInBox(db: SupabaseClient, boxId: string): Promise<SeriesRow[]> {
  const out: SeriesRow[] = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 200; guard += 1) {
    let q = db
      .from('series')
      .select(
        'id, serial_number, s2, s3, s4, created_at, current_status, service_order_id, model_id, brand_id, material, valuation, sap_status, current_box_id'
      )
      .eq('current_box_id', boxId)
      .order('id', { ascending: true })
      .limit(201);
    if (cursor) q = q.gt('id', cursor);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const chunk = (data ?? []) as SeriesRow[];
    if (chunk.length === 0) break;
    const hasMore = chunk.length > 200;
    const page = hasMore ? chunk.slice(0, 200) : chunk;
    out.push(...page);
    if (!hasMore) break;
    cursor = page[page.length - 1]?.id;
  }
  return out;
}

async function fetchMap(
  db: SupabaseClient,
  table: string,
  ids: string[],
  cols: string
): Promise<Map<string, Record<string, unknown>>> {
  const map = new Map<string, Record<string, unknown>>();
  if (ids.length === 0) return map;
  const chunkSize = 80;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await db.from(table).select(cols).in('id', chunk);
    if (error) continue;
    for (const row of data || []) {
      map.set(String((row as { id: string }).id), row as Record<string, unknown>);
    }
  }
  return map;
}

async function fetchSiblingsByServiceOrders(
  db: SupabaseClient,
  osIds: string[]
): Promise<Map<string, SeriesRow[]>> {
  const byOs = new Map<string, SeriesRow[]>();
  if (osIds.length === 0) return byOs;

  const chunkSize = 80;
  for (let i = 0; i < osIds.length; i += chunkSize) {
    const chunk = osIds.slice(i, i + chunkSize);
    const { data, error } = await db
      .from('series')
      .select(
        'id, serial_number, s2, s3, s4, created_at, current_status, service_order_id, model_id, brand_id, material, valuation, sap_status, current_box_id'
      )
      .in('service_order_id', chunk)
      .order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as SeriesRow[]) {
      const key = String(row.service_order_id);
      if (!byOs.has(key)) byOs.set(key, []);
      byOs.get(key)!.push(row);
    }
  }
  return byOs;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  const roleCheck = await logOnlyRoleCheck(req, ROLES_BODEGA_DESPACHO, {
    module: 'bodega',
    action: 'export_outbound_boxes',
  });
  if (roleCheck) return roleCheck;

  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', issues: parsed.error.flatten() },
      { status: 422 }
    );
  }

  const boxIds = parsed.data.boxIds;
  const db = getSupabaseServerClient();

  const { data: boxRows, error: boxErr } = await db
    .from('boxes')
    .select('id, box_code, rack_location, capacity, created_at, brand_id, model_id')
    .in('id', boxIds);
  if (boxErr) {
    return NextResponse.json({ error: 'QUERY_FAILED: ' + boxErr.message }, { status: 500 });
  }

  const staging = (boxRows ?? []).filter((b) =>
    isOutboundStagingRack(b.rack_location as string | null)
  );
  if (staging.length === 0) {
    return NextResponse.json({ error: 'No hay cajas OUTBOUND válidas para exportar' }, { status: 404 });
  }

  const candidates: WarehouseBoxListRow[] = [];
  const seriesByBox = new Map<string, SeriesRow[]>();

  for (const b of staging) {
    const id = String(b.id);
    const series = await fetchAllSeriesInBox(db, id);
    seriesByBox.set(id, series);
    const osIds = new Set<string>();
    let sampleBrand: string | null = b.brand_id as string | null;
    let sampleModel: string | null = b.model_id as string | null;
    let sampleOs: string | null = null;
    for (const s of series) {
      osIds.add(String(s.service_order_id || s.id));
      if (!sampleOs) {
        sampleBrand = s.brand_id ?? sampleBrand;
        sampleModel = s.model_id ?? sampleModel;
        sampleOs = s.service_order_id;
      }
    }
    candidates.push({
      box_id: id,
      rack: b.rack_location as string | null,
      label: b.box_code as string | null,
      capacity: b.capacity as number | null,
      series_count: series.length,
      equipos_count: osIds.size,
      sample_brand_id: sampleBrand,
      sample_model_id: sampleModel,
      sample_service_order_id: sampleOs,
      last_movement_at: null,
    });
  }

  const enriched = await enrichWarehouseBoxItems(db, candidates);
  const boxMeta = new Map(enriched.map((bx) => [bx.box_id, bx]));

  const detailRows: Record<string, string | number>[] = [];
  const summaryMap = new Map<
    string,
    { tech: string; brand: string; model: string; boxes: Set<string>; units: number }
  >();

  for (const b of staging) {
    const boxId = String(b.id);
    const meta = boxMeta.get(boxId);
    const series = seriesByBox.get(boxId) || [];
    const osIds = [...new Set(series.map((s) => s.service_order_id).filter(Boolean))] as string[];
    const modelIds = [...new Set(series.map((s) => s.model_id).filter(Boolean))] as string[];
    const [osMap, modelMap, siblingsByOs] = await Promise.all([
      fetchMap(db, 'service_orders', osIds, 'id, os_label, main_serial'),
      fetchMap(db, 'models', modelIds, 'id, name, brand_id, technology_id'),
      fetchSiblingsByServiceOrders(db, osIds),
    ]);

    const brandIds = [
      ...new Set(
        [
          meta?.sample_brand_id,
          ...series.map((s) => s.brand_id),
          ...[...modelMap.values()].map((m) => m.brand_id as string),
        ].filter(Boolean) as string[]
      ),
    ];
    const brandMap = await fetchMap(db, 'brands', brandIds, 'id, name');

    const tech = meta?.tech_name || '---';
    const brand = meta?.brand_name || 'N/A';
    const model = meta?.model_name || 'N/A';
    const sumKey = `${tech}|${brand}|${model}`;
    const sum = summaryMap.get(sumKey) || {
      tech,
      brand,
      model,
      boxes: new Set<string>(),
      units: 0,
    };
    sum.boxes.add(boxId);
    sum.units += osIds.size || series.length;
    summaryMap.set(sumKey, sum);

    const boxCode = meta?.label || boxId;
    const capacity = Number(meta?.capacity || 0);
    const equipos = Number(meta?.equipos_count ?? meta?.series_count ?? series.length);

    if (series.length === 0) {
      detailRows.push({
        'Código Caja': boxCode,
        'ID Caja (UUID)': boxId,
        Tecnología: tech,
        Marca: brand,
        Modelo: model,
        Ubicación: meta?.rack || 'OUTBOUND',
        Equipos: equipos,
        Capacidad: capacity,
        '#': 1,
        S1: '',
        S2: '',
        S3: '',
        S4: '',
        'Orden (OS)': '',
        Material: '',
        Valoración: '',
        'Estado serie': '',
        'SAP serie': '',
      });
      continue;
    }

    const inBoxIds = new Set(series.map((s) => s.id));
    let equipIdx = 0;

    const equipmentKeys = [
      ...new Set(
        series.map((s) => (s.service_order_id ? String(s.service_order_id) : `orphan:${s.id}`))
      ),
    ];

    for (const key of equipmentKeys) {
      const isOrphan = key.startsWith('orphan:');
      const osId = isOrphan ? null : key;
      const group: SeriesRow[] = osId
        ? siblingsByOs.get(osId) || series.filter((s) => s.service_order_id === osId)
        : series.filter((s) => `orphan:${s.id}` === key);

      const inBox = group.some((s) => inBoxIds.has(s.id));
      if (!inBox) continue;

      equipIdx += 1;
      const osRow = osId ? osMap.get(osId) : null;
      const mainSerial = osRow?.main_serial ? String(osRow.main_serial) : null;
      const slots = buildEquipmentSerialSlots(group, mainSerial);
      const { material, valuation } = coalesceMaterialLote(group);
      const primary = slots.primary;

      const m = primary.model_id ? modelMap.get(String(primary.model_id)) : null;
      const bName = primary.brand_id
        ? brandMap.get(String(primary.brand_id))?.name
        : m?.brand_id
          ? brandMap.get(String(m.brand_id))?.name
          : brand;

      detailRows.push({
        'Código Caja': boxCode,
        'ID Caja (UUID)': boxId,
        Tecnología: tech,
        Marca: String(bName || brand),
        Modelo: String(m?.name || model),
        Ubicación: meta?.rack || 'OUTBOUND',
        Equipos: equipos,
        Capacidad: capacity,
        '#': equipIdx,
        S1: slots.s1,
        S2: slots.s2,
        S3: slots.s3,
        S4: slots.s4,
        'Orden (OS)': String(osRow?.os_label || ''),
        Material: material || primary.material || '',
        Valoración: valuation || primary.valuation || '',
        'Estado serie': primary.current_status || '',
        'SAP serie': primary.sap_status || '',
      });
    }
  }

  const summaryRows = [...summaryMap.values()]
    .sort((a, b) => b.units - a.units)
    .map((s) => ({
      Tecnología: s.tech,
      Marca: s.brand,
      Modelo: s.model,
      'Cajas OUTBOUND': s.boxes.size,
      'Equipos (total)': s.units,
    }));

  const totalEquipos = summaryRows.reduce((acc, r) => acc + Number(r['Equipos (total)'] || 0), 0);
  summaryRows.push({
    Tecnología: 'TOTAL',
    Marca: '',
    Modelo: '',
    'Cajas OUTBOUND': staging.length,
    'Equipos (total)': totalEquipos,
  });

  const wb = XLSX.utils.book_new();
  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle por equipo');
  const wsSum = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSum, 'Resumen modelo');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const today = new Date().toISOString().slice(0, 10);
  const suffix = staging.length === 1 ? staging[0].box_code || staging[0].id : `${staging.length}_cajas`;

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Bodega_Salida_${String(suffix).replace(/[^\w.-]+/g, '_')}_${today}.xlsx"`,
    },
  });
}
