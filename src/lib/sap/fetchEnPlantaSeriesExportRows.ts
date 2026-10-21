import type { SupabaseClient } from '@supabase/supabase-js';
import { SAP_DASHBOARD_STATES } from '@/lib/sap/sapDashboardStates';
import {
  buildEquipmentSerialSlots,
  type SerialPickRow,
} from '@/lib/sap/equipmentSerialSlots';
import {
  EQUIPO_LISTO_AUDIT_ACTIONS,
  isCacTrayRowPendiente,
  OS_INVENTORY_EXPORT_STATUS,
  resolveOsInventoryExportStatus,
  type BoxMeta,
} from '@/lib/sap/osInventoryExportLabels';

const OS_PAGE = 1000;
const OS_CHUNK = 150;
const SERIES_PAGE = 1000;

export type EnPlantaSeriesExportRow = {
  OS: string;
  Marca: string;
  Modelo: string;
  Tecnologia: string;
  S1: string;
  S2: string;
  S3: string;
  S4: string;
  'Estatus SAP': string;
  'Estatus operativo': string;
};

type OsMeta = {
  id: string;
  os_label: string | null;
  main_serial: string | null;
  sap_integration_status: string | null;
  brand_id: string | null;
  model_id: string | null;
};

type SeriesRow = SerialPickRow & {
  id: string;
  serial_number: string | null;
  current_status: string | null;
  current_box_id: string | null;
  service_order_id: string | null;
};

async function loadCatalogMaps(db: SupabaseClient) {
  const [{ data: techs }, { data: brands }, { data: models }] = await Promise.all([
    db.from('technologies').select('id, name'),
    db.from('brands').select('id, name'),
    db.from('models').select('id, name, technology_id'),
  ]);
  return {
    techMap: new Map((techs || []).map((row: { id: string; name: string }) => [row.id, row.name])),
    brandMap: new Map((brands || []).map((row: { id: string; name: string }) => [row.id, row.name])),
    modelMap: new Map(
      (models || []).map((row: { id: string; name: string; technology_id: string | null }) => [
        row.id,
        row,
      ]),
    ),
  };
}

async function fetchAllEnPlantaOsMeta(db: SupabaseClient): Promise<Map<string, OsMeta>> {
  const map = new Map<string, OsMeta>();
  for (const { status } of SAP_DASHBOARD_STATES) {
    let offset = 0;
    let total = Infinity;
    while (offset < total) {
      const { data, error } = await db.rpc('fetch_os_sap_status_en_planta', {
        p_status: status,
        p_limit: OS_PAGE,
        p_offset: offset,
      });
      if (error) throw new Error(error.message);
      const rows = (data || []) as Array<Record<string, unknown>>;
      if (rows.length === 0) break;
      total = Number(rows[0]?.total_count ?? 0);
      for (const row of rows) {
        const id = String(row.id);
        map.set(id, {
          id,
          os_label: (row.os_label as string | null) ?? null,
          main_serial: (row.main_serial as string | null) ?? null,
          sap_integration_status: (row.sap_integration_status as string | null) ?? null,
          brand_id: null,
          model_id: null,
        });
      }
      offset += OS_PAGE;
    }
  }

  const ids = [...map.keys()];
  for (let i = 0; i < ids.length; i += OS_CHUNK) {
    const chunk = ids.slice(i, i + OS_CHUNK);
    const { data, error } = await db
      .from('service_orders')
      .select('id, brand_id, model_id')
      .in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const id = String(row.id);
      const meta = map.get(id);
      if (!meta) continue;
      meta.brand_id = row.brand_id ?? null;
      meta.model_id = row.model_id ?? null;
    }
  }

  return map;
}

async function loadPendienteIngresoOsIds(
  db: SupabaseClient,
  enPlantaIds: Set<string>,
): Promise<Set<string>> {
  const pendiente = new Set<string>();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await db
      .from('cac_tray_units')
      .select('service_order_id, unit_status, unit_status_label')
      .eq('is_active', true)
      .not('service_order_id', 'is', null)
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    for (const row of batch) {
      if (!isCacTrayRowPendiente(row)) continue;
      const id = String(row.service_order_id);
      if (enPlantaIds.has(id)) pendiente.add(id);
    }
    if (batch.length < page) break;
    from += page;
  }
  return pendiente;
}

async function loadBoxMeta(db: SupabaseClient, boxIds: string[]): Promise<Map<string, BoxMeta>> {
  const map = new Map<string, BoxMeta>();
  for (let i = 0; i < boxIds.length; i += 200) {
    const chunk = boxIds.slice(i, i + 200);
    const { data } = await db.from('boxes').select('id, box_code, rack_location').in('id', chunk);
    for (const row of data || []) {
      map.set(String(row.id), {
        box_code: row.box_code ?? null,
        rack_location: row.rack_location ?? null,
      });
    }
  }
  return map;
}

function resolveCatalogNames(
  os: OsMeta,
  brandMap: Map<string, string>,
  modelMap: Map<string, { name: string; technology_id: string | null }>,
  techMap: Map<string, string>,
): { marca: string; modelo: string; tecnologia: string } {
  const model = os.model_id ? modelMap.get(os.model_id) : undefined;
  const marca = os.brand_id ? brandMap.get(os.brand_id) || '—' : '—';
  const modelo = model?.name || '—';
  const tecnologia = model?.technology_id
    ? techMap.get(model.technology_id) || '—'
    : '—';
  return { marca, modelo, tecnologia };
}

function osHasScrapBox(series: SeriesRow[], boxById: Map<string, BoxMeta>): boolean {
  return series.some((s) => {
    if (!s.current_box_id) return false;
    const box = boxById.get(String(s.current_box_id));
    const rack = String(box?.rack_location || '').trim().toUpperCase();
    const code = String(box?.box_code || '').trim().toUpperCase();
    return (
      rack === 'SCRAP' ||
      rack === 'SCRAPS' ||
      rack.startsWith('SCRAP') ||
      code.startsWith('BOX-BAD')
    );
  });
}

/**
 * Una fila por **OS única** en planta (universo KPI En planta).
 */
export async function fetchEnPlantaSeriesExportRows(
  db: SupabaseClient,
): Promise<{ rows: EnPlantaSeriesExportRow[]; osCount: number; seriesCount: number }> {
  const [osMeta, catalogs] = await Promise.all([
    fetchAllEnPlantaOsMeta(db),
    loadCatalogMaps(db),
  ]);
  const { brandMap, modelMap, techMap } = catalogs;
  const enPlantaIds = new Set(osMeta.keys());
  const osIds = [...enPlantaIds];
  if (osIds.length === 0) {
    return { rows: [], osCount: 0, seriesCount: 0 };
  }

  const pendienteIngreso = await loadPendienteIngresoOsIds(db, enPlantaIds);

  const seriesByOs = new Map<string, SeriesRow[]>();
  let totalSeriesLoaded = 0;
  const boxIdSet = new Set<string>();

  for (let i = 0; i < osIds.length; i += OS_CHUNK) {
    const chunk = osIds.slice(i, i + OS_CHUNK);
    let from = 0;
    for (;;) {
      const { data, error } = await db
        .from('series')
        .select(
          'id, serial_number, material, valuation, sap_status, current_status, current_box_id, service_order_id, created_at, s2, s3, s4',
        )
        .in('service_order_id', chunk)
        .order('serial_number', { ascending: true })
        .range(from, from + SERIES_PAGE - 1);
      if (error) throw new Error(error.message);
      const batch = (data || []) as SeriesRow[];
      for (const s of batch) {
        const oid = String(s.service_order_id || '');
        if (!oid) continue;
        if (!seriesByOs.has(oid)) seriesByOs.set(oid, []);
        seriesByOs.get(oid)!.push(s);
        if (s.current_box_id) boxIdSet.add(String(s.current_box_id));
        totalSeriesLoaded += 1;
      }
      if (batch.length < SERIES_PAGE) break;
      from += SERIES_PAGE;
    }
  }

  for (const [osId, group] of seriesByOs) {
    if (group.some((s) => s.current_status === 'RECEPCIONADO_BODEGA_GENERAL')) {
      pendienteIngreso.add(osId);
    }
  }

  const boxById = await loadBoxMeta(db, [...boxIdSet]);

  const centralSeriesIds: string[] = [];
  for (const group of seriesByOs.values()) {
    for (const s of group) {
      if (s.current_status === 'in_central_warehouse' && s.id) {
        centralSeriesIds.push(String(s.id));
      }
    }
  }
  const auditedCentralSeries = new Set<string>();
  for (let i = 0; i < centralSeriesIds.length; i += 100) {
    const chunk = centralSeriesIds.slice(i, i + 100);
    const { data } = await db
      .from('erp_audit_logs')
      .select('record_id')
      .in('record_id', chunk)
      .in('action', [...EQUIPO_LISTO_AUDIT_ACTIONS]);
    for (const row of data || []) {
      if (row.record_id) auditedCentralSeries.add(String(row.record_id));
    }
  }

  const rows: EnPlantaSeriesExportRow[] = [];

  for (const [osId, os] of osMeta) {
    const group = seriesByOs.get(osId) || [];
    const { marca, modelo, tecnologia } = resolveCatalogNames(os, brandMap, modelMap, techMap);
    const estatusSap = os.sap_integration_status || '—';
    const osHasDispatch = group.some((s) => s.current_status === 'in_dispatch_warehouse');
    const scrapBoxOnOs = osHasScrapBox(group, boxById);

    const seriesCtx = {
      pendienteIngreso: pendienteIngreso.has(osId),
      osHasDispatch,
      auditedCentralSeriesIds: auditedCentralSeries,
      boxById,
      osHasScrapBox: scrapBoxOnOs,
    };

    let s1 = '';
    let s2 = '';
    let s3 = '';
    let s4 = '';
    if (group.length > 0) {
      const slots = buildEquipmentSerialSlots(group, os.main_serial);
      s1 = slots.s1;
      s2 = slots.s2;
      s3 = slots.s3;
      s4 = slots.s4;
    } else if (os.main_serial?.trim()) {
      s1 = os.main_serial.trim();
    }

    const estatusOperativo =
      group.length === 0
        ? OS_INVENTORY_EXPORT_STATUS.SIN_SERIES
        : resolveOsInventoryExportStatus(group, seriesCtx);

    rows.push({
      OS: os.os_label || '—',
      Marca: marca,
      Modelo: modelo,
      Tecnologia: tecnologia,
      S1: s1 || '—',
      S2: s2 || '—',
      S3: s3 || '—',
      S4: s4 || '—',
      'Estatus SAP': estatusSap,
      'Estatus operativo': estatusOperativo,
    });
  }

  rows.sort((a, b) => a.OS.localeCompare(b.OS, undefined, { numeric: true }));

  return {
    rows,
    osCount: rows.length,
    seriesCount: totalSeriesLoaded,
  };
}
