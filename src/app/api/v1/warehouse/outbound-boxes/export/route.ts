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

/** ETL largo: acumula cajas por fases internas → un solo XLSX. */
export const maxDuration = 300;

/** Un solo archivo Excel (fases internas de lectura, no varios descargas). */
const OUTBOUND_EXPORT_MAX_BOXES = 1000;

const BoxIdsSchema = z.array(z.string().uuid()).min(1).max(OUTBOUND_EXPORT_MAX_BOXES);

/** Compat GET: query `boxIds=uuid,uuid` (solo lotes pequeños; preferir POST). */
const QuerySchema = z.object({
  boxIds: z
    .string()
    .min(1)
    .max(16_000)
    .transform((s) =>
      s
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    )
    .pipe(BoxIdsSchema),
});

const BodySchema = z.object({
  boxIds: BoxIdsSchema,
});

type SeriesRow = SerialPickRow & {
  current_status: string | null;
  service_order_id: string | null;
  model_id: string | null;
  brand_id: string | null;
  sap_status: string | null;
  current_box_id?: string | null;
};

function validationErrorResponse(error: z.ZodError): NextResponse {
  const flat = error.flatten();
  const messages = [
    ...Object.values(flat.fieldErrors).flatMap((v) => v ?? []),
    ...(flat.formErrors ?? []),
  ].join(' ');
  let detail = 'Parámetros de exportación inválidos.';
  if (/too big|<=\s*\d+|maximum/i.test(messages)) {
    detail = `Máximo ${OUTBOUND_EXPORT_MAX_BOXES} cajas por Excel. Reduzca el rango Desde–Hasta.`;
  } else if (/uuid|invalid/i.test(messages)) {
    detail = 'Uno o más IDs de caja no son UUID válidos.';
  } else if (/too small|required|min/i.test(messages)) {
    detail = 'Seleccione al menos una caja OUTBOUND para exportar.';
  }
  return NextResponse.json({ error: 'VALIDATION_ERROR', detail, issues: flat }, { status: 422 });
}

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

async function buildOutboundExportResponse(boxIds: string[]): Promise<NextResponse> {
  const db = getSupabaseServerClient();

  type BoxRow = {
    id: string;
    box_code: string | null;
    rack_location: string | null;
    capacity: number | null;
    created_at: string | null;
    brand_id: string | null;
    model_id: string | null;
  };

  const boxRows: BoxRow[] = [];
  const boxChunk = 80;
  for (let i = 0; i < boxIds.length; i += boxChunk) {
    const chunk = boxIds.slice(i, i + boxChunk);
    const { data, error: boxErr } = await db
      .from('boxes')
      .select('id, box_code, rack_location, capacity, created_at, brand_id, model_id')
      .in('id', chunk);
    if (boxErr) {
      return NextResponse.json({ error: 'QUERY_FAILED: ' + boxErr.message }, { status: 500 });
    }
    boxRows.push(...((data ?? []) as BoxRow[]));
  }

  const orderIndex = new Map(boxIds.map((id, idx) => [id, idx]));
  const staging = boxRows
    .filter((b) => isOutboundStagingRack(b.rack_location as string | null))
    .sort((a, b) => (orderIndex.get(String(a.id)) ?? 0) - (orderIndex.get(String(b.id)) ?? 0));
  if (staging.length === 0) {
    return NextResponse.json({ error: 'No hay cajas OUTBOUND válidas para exportar' }, { status: 404 });
  }

  const candidates: WarehouseBoxListRow[] = [];
  const seriesByBox = new Map<string, SeriesRow[]>();

  // Fases internas (ETL): lee series en paralelo por lotes; un solo workbook al final.
  const SERIES_PHASE = 8;
  for (let i = 0; i < staging.length; i += SERIES_PHASE) {
    const phase = staging.slice(i, i + SERIES_PHASE);
    const loaded = await Promise.all(
      phase.map(async (b) => {
        const id = String(b.id);
        const series = await fetchAllSeriesInBox(db, id);
        return { b, id, series };
      })
    );
    for (const { b, id, series } of loaded) {
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
  }

  const enriched = await enrichWarehouseBoxItems(db, candidates);
  const boxMeta = new Map(enriched.map((bx) => [bx.box_id, bx]));

  const detailRows: Record<string, string | number>[] = [];
  const summaryMap = new Map<
    string,
    {
      tech: string;
      brand: string;
      model: string;
      boxes: Set<string>;
      units: number;
      equiposValorados: number;
      equiposNoValorados: number;
      equiposSinVal: number;
    }
  >();
  const boxSummaryRows: Record<string, string | number>[] = [];

  function classifyValuationLabel(raw: string): 'VALORADO' | 'NO VALORADO' | 'SIN VALORACIÓN' {
    const s = String(raw || '').trim();
    if (!s) return 'SIN VALORACIÓN';
    if (/novalorad|no\s*valorad/i.test(s)) return 'NO VALORADO';
    if (/valorado/i.test(s)) return 'VALORADO';
    // Lotes SAP distintos de NOVALORADO se tratan como valorados (ej. VALORADO / lote).
    return 'VALORADO';
  }

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
      equiposValorados: 0,
      equiposNoValorados: 0,
      equiposSinVal: 0,
    };
    sum.boxes.add(boxId);

    const boxCode = meta?.label || boxId;
    const capacity = Number(meta?.capacity || 0);
    const equipos = Number(meta?.equipos_count ?? meta?.series_count ?? series.length);

    let boxEquiposValorados = 0;
    let boxEquiposNoValorados = 0;
    let boxEquiposSinVal = 0;
    const valuationLabels = new Set<string>();
    let sampleMaterial = '';
    let sampleValuation = '';

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
        'Clase valoración': 'SIN VALORACIÓN',
        'Estado serie': '',
        'SAP serie': '',
      });
      boxSummaryRows.push({
        'Código Caja': boxCode,
        Tecnología: tech,
        Marca: brand,
        Modelo: model,
        Material: '',
        'Valoración caja': '',
        'Clase caja': 'VACÍA',
        Equipos: 0,
        Capacidad: capacity,
        'Equipos VALORADO': 0,
        'Equipos NO VALORADO': 0,
        'Equipos sin valoración': 0,
      });
      summaryMap.set(sumKey, sum);
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
      const valRaw = String(valuation || primary.valuation || '').trim();
      const matRaw = String(material || primary.material || '').trim();
      const valClass = classifyValuationLabel(valRaw);
      if (valClass === 'VALORADO') boxEquiposValorados += 1;
      else if (valClass === 'NO VALORADO') boxEquiposNoValorados += 1;
      else boxEquiposSinVal += 1;
      if (valRaw) valuationLabels.add(valRaw);
      if (!sampleMaterial && matRaw) sampleMaterial = matRaw;
      if (!sampleValuation && valRaw) sampleValuation = valRaw;

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
        Material: matRaw,
        Valoración: valRaw,
        'Clase valoración': valClass,
        'Estado serie': primary.current_status || '',
        'SAP serie': primary.sap_status || '',
      });
    }

    sum.units += equipIdx;
    sum.equiposValorados += boxEquiposValorados;
    sum.equiposNoValorados += boxEquiposNoValorados;
    sum.equiposSinVal += boxEquiposSinVal;
    summaryMap.set(sumKey, sum);

    let claseCaja: string = 'VACÍA';
    if (equipIdx === 0) claseCaja = 'VACÍA';
    else if (boxEquiposValorados > 0 && boxEquiposNoValorados === 0 && boxEquiposSinVal === 0) {
      claseCaja = 'VALORADO';
    } else if (boxEquiposNoValorados > 0 && boxEquiposValorados === 0 && boxEquiposSinVal === 0) {
      claseCaja = 'NO VALORADO';
    } else if (boxEquiposValorados > 0 && boxEquiposNoValorados > 0) {
      claseCaja = 'MIXTO';
    } else if (boxEquiposSinVal > 0 && boxEquiposValorados === 0 && boxEquiposNoValorados === 0) {
      claseCaja = 'SIN VALORACIÓN';
    } else {
      claseCaja = 'MIXTO';
    }

    boxSummaryRows.push({
      'Código Caja': boxCode,
      Tecnología: tech,
      Marca: brand,
      Modelo: model,
      Material: sampleMaterial,
      'Valoración caja': [...valuationLabels].join(' | ') || sampleValuation,
      'Clase caja': claseCaja,
      Equipos: equipIdx,
      Capacidad: capacity,
      'Equipos VALORADO': boxEquiposValorados,
      'Equipos NO VALORADO': boxEquiposNoValorados,
      'Equipos sin valoración': boxEquiposSinVal,
    });
  }

  boxSummaryRows.sort((a, b) =>
    String(a['Código Caja']).localeCompare(String(b['Código Caja']), 'es', { numeric: true })
  );

  const summaryRows = [...summaryMap.values()]
    .sort((a, b) => b.units - a.units)
    .map((s) => ({
      Tecnología: s.tech,
      Marca: s.brand,
      Modelo: s.model,
      'Cajas OUTBOUND': s.boxes.size,
      'Equipos (total)': s.units,
      'Equipos VALORADO': s.equiposValorados,
      'Equipos NO VALORADO': s.equiposNoValorados,
      'Equipos sin valoración': s.equiposSinVal,
    }));

  const totalEquipos = summaryRows.reduce((acc, r) => acc + Number(r['Equipos (total)'] || 0), 0);
  const totalVal = summaryRows.reduce((acc, r) => acc + Number(r['Equipos VALORADO'] || 0), 0);
  const totalNoVal = summaryRows.reduce((acc, r) => acc + Number(r['Equipos NO VALORADO'] || 0), 0);
  const totalSin = summaryRows.reduce((acc, r) => acc + Number(r['Equipos sin valoración'] || 0), 0);
  summaryRows.push({
    Tecnología: 'TOTAL',
    Marca: '',
    Modelo: '',
    'Cajas OUTBOUND': staging.length,
    'Equipos (total)': totalEquipos,
    'Equipos VALORADO': totalVal,
    'Equipos NO VALORADO': totalNoVal,
    'Equipos sin valoración': totalSin,
  });

  const claseTotales = {
    VALORADO: boxSummaryRows.filter((r) => r['Clase caja'] === 'VALORADO').length,
    'NO VALORADO': boxSummaryRows.filter((r) => r['Clase caja'] === 'NO VALORADO').length,
    MIXTO: boxSummaryRows.filter((r) => r['Clase caja'] === 'MIXTO').length,
    'SIN VALORACIÓN': boxSummaryRows.filter((r) => r['Clase caja'] === 'SIN VALORACIÓN').length,
    VACÍA: boxSummaryRows.filter((r) => r['Clase caja'] === 'VACÍA').length,
  };
  const valuationOverview = [
    { Clase: 'VALORADO', 'Cajas': claseTotales.VALORADO },
    { Clase: 'NO VALORADO', 'Cajas': claseTotales['NO VALORADO'] },
    { Clase: 'MIXTO', 'Cajas': claseTotales.MIXTO },
    { Clase: 'SIN VALORACIÓN', 'Cajas': claseTotales['SIN VALORACIÓN'] },
    { Clase: 'VACÍA', 'Cajas': claseTotales.VACÍA },
    { Clase: 'TOTAL', 'Cajas': boxSummaryRows.length },
  ];

  const wb = XLSX.utils.book_new();
  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detalle por equipo');
  const wsBox = XLSX.utils.json_to_sheet(boxSummaryRows);
  XLSX.utils.book_append_sheet(wb, wsBox, 'Resumen por caja');
  const wsVal = XLSX.utils.json_to_sheet(valuationOverview);
  XLSX.utils.book_append_sheet(wb, wsVal, 'Valoración cajas');
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

async function authorizeExport(req: NextRequest): Promise<NextResponse | null> {
  const auth = await requireApiUser(req);
  if (auth instanceof NextResponse) return auth;

  return logOnlyRoleCheck(req, ROLES_BODEGA_DESPACHO, {
    module: 'bodega',
    action: 'export_outbound_boxes',
  });
}

/** Preferir POST; GET queda por compatibilidad con lotes pequeños. */
export async function GET(req: NextRequest) {
  const denied = await authorizeExport(req);
  if (denied) return denied;

  const parsed = QuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return validationErrorResponse(parsed.error);

  return buildOutboundExportResponse(parsed.data.boxIds);
}

export async function POST(req: NextRequest) {
  const denied = await authorizeExport(req);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', detail: 'JSON inválido en el cuerpo de la solicitud.' },
      { status: 422 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return validationErrorResponse(parsed.error);

  return buildOutboundExportResponse(parsed.data.boxIds);
}
