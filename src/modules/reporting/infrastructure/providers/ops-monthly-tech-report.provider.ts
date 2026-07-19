import { getSupabaseServerClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IReportDataProvider } from '../../domain/ports/report-data-provider.port';
import type { ReportDataResult, ReportFilterParams, ReportRow } from '../../domain/types/report.types';

const MONTH_LABELS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'] as const;
const CHUNK = 200;

/**
 * Status de cola Taller (mismo criterio que count_workshop_os_all_tabs,
 * sin "listo" — ese se resuelve aparte con auditoría).
 */
const TALLER_QUEUE_STATUSES = [
  'in_workshop',
  'in_qc',
  'in_validation',
  'ready_to_dispatch',
  'in_control_warehouse',
  'irreparable',
] as const;

const TALLER_ENTRY_AUDIT_ACTIONS = [
  'INGRESO A TALLER',
  'TRASLADO MASIVO A TALLER',
  'DIAGNÓSTICO INICIAL COMPLETADO',
  'REPARACIÓN COMPLETADA',
  'REACONDICIONADO COMPLETADO',
  'CONTROL DE CALIDAD COMPLETADO',
] as const;

type BucketKey = string;
type Source = 'cac' | 'px';

type Bucket = {
  year: number;
  country: string;
  month: number;
  tech: string;
  ingresadoCac: number;
  ingresadoPx: number;
  tallerCac: number;
  tallerPx: number;
  obsoletoCac: number;
  obsoletoPx: number;
  reparadoCac: number;
  reparadoPx: number;
  reacondicionadoCac: number;
  reacondicionadoPx: number;
};

type OsMeta = {
  modelId: string | null;
  receptionId: string | null;
};

type SeriesRow = {
  id: string;
  service_order_id: string | null;
  model_id: string | null;
  current_reception_id: string | null;
  current_status: string | null;
  entry_source: string | null;
};

type IngresadoHit = {
  osId: string;
  seriesIds: string[];
  year: number;
  month: number;
  tech: string;
  source: Source;
};

/** Origen del equipo (OS): mayoría de series.entry_source, con fallback. */
function sourceFromSeriesList(seriesList: SeriesRow[], fallback: Source): Source {
  let cac = 0;
  let px = 0;
  for (const s of seriesList) {
    const e = String(s.entry_source || '').toLowerCase().trim();
    if (e === 'cac') cac += 1;
    else if (e === 'px') px += 1;
  }
  if (cac === 0 && px === 0) return fallback;
  return px >= cac ? 'px' : 'cac';
}

function bucketKey(year: number, month: number, tech: string): BucketKey {
  return `${year}|${month}|${tech}`;
}

function emptyBucket(year: number, country: string, month: number, tech: string): Bucket {
  return {
    year,
    country,
    month,
    tech,
    ingresadoCac: 0,
    ingresadoPx: 0,
    tallerCac: 0,
    tallerPx: 0,
    obsoletoCac: 0,
    obsoletoPx: 0,
    reparadoCac: 0,
    reparadoPx: 0,
    reacondicionadoCac: 0,
    reacondicionadoPx: 0,
  };
}

function parseMonthFilter(raw?: string): number | null {
  if (!raw?.trim()) return null;
  const t = raw.trim().toUpperCase();
  const idx = MONTH_LABELS.indexOf(t as (typeof MONTH_LABELS)[number]);
  if (idx >= 0) return idx + 1;
  const n = Number(t);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
  return null;
}

function normalizeTechName(name: string | null | undefined): string {
  const raw = String(name || 'SIN TECNOLOGÍA').trim().toUpperCase();
  if (!raw) return 'SIN TECNOLOGÍA';
  if (raw.includes('ADSL') || raw.includes('XDSL') || raw === 'DSL') return 'ADSL';
  if (raw.includes('EMTA')) return 'EMTA';
  if (raw.includes('STB') || raw.includes('HFC')) return 'STB';
  if (raw.includes('IPTV')) return 'IPTV';
  if (raw.includes('WTTH') || raw.includes('WTTX')) return 'WTTH';
  if (raw.includes('DTH')) return 'DTH';
  if (raw.includes('GPON') || raw.includes('ONT')) return 'GPON';
  if (raw.includes('IFI') || raw.includes('WIFI') || raw.includes('WI-FI')) return 'IFI';
  return raw;
}

function numOrBlank(n: number): number | '' {
  return n > 0 ? n : '';
}

function sourceFromEntry(entry: string | null | undefined, fallback: Source = 'cac'): Source {
  const e = String(entry || '').toLowerCase().trim();
  if (e === 'cac' || e === 'px') return e;
  return fallback;
}

async function fetchPaged<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(error.message);
    const chunk = data || [];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return out;
}

async function loadModelTechMap(supabase: SupabaseClient): Promise<Map<string, string>> {
  const models = await fetchPaged<{ id: string; technology_id: string | null }>((from, to) =>
    supabase.from('models').select('id, technology_id').range(from, to)
  );
  const techs = await fetchPaged<{ id: string; name: string }>((from, to) =>
    supabase.from('technologies').select('id, name').range(from, to)
  );
  const techById = new Map(techs.map((t) => [t.id, normalizeTechName(t.name)]));
  const map = new Map<string, string>();
  for (const m of models) {
    map.set(m.id, techById.get(m.technology_id || '') || 'SIN TECNOLOGÍA');
  }
  return map;
}

async function loadOsMeta(supabase: SupabaseClient, osIds: string[]): Promise<Map<string, OsMeta>> {
  const map = new Map<string, OsMeta>();
  for (let i = 0; i < osIds.length; i += CHUNK) {
    const chunk = osIds.slice(i, i + CHUNK);
    const rows = await fetchPaged<{
      id: string;
      model_id: string | null;
      reception_id: string | null;
    }>((from, to) =>
      supabase.from('service_orders').select('id, model_id, reception_id').in('id', chunk).range(from, to)
    );
    for (const r of rows) {
      map.set(String(r.id), {
        modelId: r.model_id ? String(r.model_id) : null,
        receptionId: r.reception_id ? String(r.reception_id) : null,
      });
    }
  }
  return map;
}

async function loadReceptionSources(
  supabase: SupabaseClient,
  receptionIds: string[]
): Promise<Map<string, Source>> {
  const map = new Map<string, Source>();
  const unique = [...new Set(receptionIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const rows = await fetchPaged<{ id: string; source: string | null }>((from, to) =>
      supabase.from('receptions').select('id, source').in('id', chunk).range(from, to)
    );
    for (const r of rows) {
      const source = String(r.source || '').toLowerCase();
      if (source === 'cac' || source === 'px') map.set(String(r.id), source);
    }
  }
  return map;
}

async function loadHistoricalCacOsSet(
  supabase: SupabaseClient,
  osIds: string[]
): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < osIds.length; i += CHUNK) {
    const chunk = osIds.slice(i, i + CHUNK);
    const rows = await fetchPaged<{ service_order_id: string | null }>((from, to) =>
      supabase
        .from('cac_tray_units')
        .select('service_order_id')
        .in('service_order_id', chunk)
        .range(from, to)
    );
    for (const r of rows) {
      if (r.service_order_id) out.add(String(r.service_order_id));
    }
  }
  return out;
}

async function loadSeriesByOsIds(
  supabase: SupabaseClient,
  osIds: string[]
): Promise<Map<string, SeriesRow[]>> {
  const byOs = new Map<string, SeriesRow[]>();
  const unique = [...new Set(osIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const rows = await fetchPaged<{
      id: string;
      service_order_id: string | null;
      model_id: string | null;
      current_reception_id: string | null;
      current_status: string | null;
      entry_source: string | null;
    }>((from, to) =>
      supabase
        .from('series')
        .select('id, service_order_id, model_id, current_reception_id, current_status, entry_source')
        .in('service_order_id', chunk)
        .range(from, to)
    );
    for (const r of rows) {
      const osId = String(r.service_order_id || '');
      if (!osId) continue;
      const row: SeriesRow = {
        id: String(r.id),
        service_order_id: osId,
        model_id: r.model_id ? String(r.model_id) : null,
        current_reception_id: r.current_reception_id ? String(r.current_reception_id) : null,
        current_status: r.current_status ? String(r.current_status) : null,
        entry_source: r.entry_source ? String(r.entry_source).toLowerCase() : null,
      };
      const list = byOs.get(osId) || [];
      list.push(row);
      byOs.set(osId, list);
    }
  }
  return byOs;
}

async function loadSeriesByIds(
  supabase: SupabaseClient,
  seriesIds: string[]
): Promise<Map<string, SeriesRow>> {
  const map = new Map<string, SeriesRow>();
  const unique = [...new Set(seriesIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const rows = await fetchPaged<{
      id: string;
      service_order_id: string | null;
      model_id: string | null;
      current_reception_id: string | null;
      current_status: string | null;
      entry_source: string | null;
    }>((from, to) =>
      supabase
        .from('series')
        .select('id, service_order_id, model_id, current_reception_id, current_status, entry_source')
        .in('id', chunk)
        .range(from, to)
    );
    for (const r of rows) {
      map.set(String(r.id), {
        id: String(r.id),
        service_order_id: r.service_order_id ? String(r.service_order_id) : null,
        model_id: r.model_id ? String(r.model_id) : null,
        current_reception_id: r.current_reception_id ? String(r.current_reception_id) : null,
        current_status: r.current_status ? String(r.current_status) : null,
        entry_source: r.entry_source ? String(r.entry_source).toLowerCase() : null,
      });
    }
  }
  return map;
}

type WorkshopSeriesRow = SeriesRow & { updated_at: string };

/** Series actualmente en cola operativa de Taller (1 fila por serie). */
async function loadCurrentWorkshopQueueSeries(
  supabase: SupabaseClient
): Promise<WorkshopSeriesRow[]> {
  return fetchPaged<WorkshopSeriesRow>((from, to) =>
    supabase
      .from('series')
      .select(
        'id, service_order_id, model_id, current_reception_id, current_status, entry_source, updated_at'
      )
      .in('current_status', [...TALLER_QUEUE_STATUSES])
      .not('service_order_id', 'is', null)
      .order('updated_at', { ascending: false })
      .range(from, to)
  );
}

/**
 * Equipo Listo vía RPC (evita scan de toda bodega central).
 * Mismo criterio que count_workshop_os_all_tabs.listo.
 */
async function loadListoWorkshopSeries(
  supabase: SupabaseClient
): Promise<WorkshopSeriesRow[]> {
  const osIds: string[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < 100 && osIds.length < 20_000; page++) {
    const { data, error } = await supabase.rpc('workshop_list_listo_os_page', {
      p_cursor: cursor,
      p_limit: 200,
    });
    if (error) {
      // RPC ausente en algún entorno: omitir listo sin tumbar el reporte
      console.warn('[ops-monthly-tech] listo RPC:', error.message);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      const id = String(row.service_order_id || '');
      if (id) osIds.push(id);
    }
    if (data.length < 200) break;
    cursor = String(data[data.length - 1].sort_ts || '') || null;
    if (!cursor) break;
  }

  if (osIds.length === 0) return [];

  const byOs = await loadSeriesByOsIds(supabase, osIds);
  const out: WorkshopSeriesRow[] = [];
  for (const list of byOs.values()) {
    for (const s of list) {
      if (s.current_status !== 'in_central_warehouse') continue;
      out.push({ ...s, updated_at: new Date().toISOString() });
    }
  }
  return out;
}

/** OS que entraron a taller en el periodo (dispersión / auditoría), aunque ya no estén en cola. */
async function loadWorkshopEntryOsByPeriod(
  supabase: SupabaseClient,
  startIso: string,
  endIso: string
): Promise<Map<string, Date>> {
  const osFirst = new Map<string, Date>();

  const audits = await fetchPaged<{
    record_id: string | null;
    created_at: string;
  }>((from, to) =>
    supabase
      .from('erp_audit_logs')
      .select('record_id, created_at')
      .eq('table_name', 'series')
      .in('action', ['INGRESO A TALLER', 'TRASLADO MASIVO A TALLER'])
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(from, to)
  );

  const seriesIds = [...new Set(audits.map((a) => String(a.record_id || '')).filter(Boolean))];
  const seriesMap = await loadSeriesByIds(supabase, seriesIds);
  for (const a of audits) {
    const series = seriesMap.get(String(a.record_id || ''));
    const osId = series?.service_order_id;
    if (!osId) continue;
    const dt = new Date(a.created_at);
    if (Number.isNaN(dt.getTime())) continue;
    const prev = osFirst.get(osId);
    if (!prev || dt < prev) osFirst.set(osId, dt);
  }

  const dispersions = await fetchPaged<{
    series_ids: string[] | null;
    created_at: string;
  }>((from, to) =>
    supabase
      .from('warehouse_movements')
      .select('series_ids, created_at')
      .eq('movement_type', 'DISPERSION_CAJA')
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: true })
      .range(from, to)
  );

  const dispSeriesIds = [
    ...new Set(dispersions.flatMap((d) => (d.series_ids as string[]) || []).filter(Boolean)),
  ];
  const dispSeriesMap = await loadSeriesByIds(supabase, dispSeriesIds);
  for (const mov of dispersions) {
    const dt = new Date(mov.created_at);
    if (Number.isNaN(dt.getTime())) continue;
    for (const sid of mov.series_ids || []) {
      const osId = dispSeriesMap.get(String(sid))?.service_order_id;
      if (!osId) continue;
      const prev = osFirst.get(osId);
      if (!prev || dt < prev) osFirst.set(osId, dt);
    }
  }

  return osFirst;
}

/**
 * Matriz = foto de referencia:
 * Ingresado | Taller | Obsoleto | Reparado | Reacondicionado  (cada uno CACs / PX)
 *
 * Unidad de conteo equipo: 1 OS = 1 (Ingresado / Taller / Obsoleto).
 * Taller = equipos en cola Taller (mismo criterio UI) + los que entraron en el periodo.
 * Reparado: 1 OS que ya avanzó de Reparación → Control de Calidad o Equipo Listo.
 *   (no cuenta los que aún están en pestaña Reparación / in_qc).
 * Reacondicionado: 1 OS en pestaña Reacondicionado (ready_to_dispatch).
 * Origen CAC/PX: series.entry_source (mayoría por OS; fallback recepción / bandeja).
 */
export class OpsMonthlyTechReportProvider implements IReportDataProvider {
  readonly code = 'OPERACIONES_MENSUAL_TECNOLOGIA';

  async fetch(filters: ReportFilterParams): Promise<ReportDataResult> {
    const supabase = getSupabaseServerClient();
    const now = new Date();
    const year = Number(filters.year) || now.getFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new Error('Año inválido. Use un año entre 2000 y 2100.');
    }

    const monthFilter = parseMonthFilter(filters.month);
    const country = (filters.country || 'GT').trim().toUpperCase() || 'GT';
    const techFilterRaw = (filters.technology || filters.techId || '').trim();

    const rangeStart = new Date(year, monthFilter ? monthFilter - 1 : 0, 1, 0, 0, 0, 0);
    const rangeEnd = monthFilter
      ? new Date(year, monthFilter, 0, 23, 59, 59, 999)
      : new Date(year, 11, 31, 23, 59, 59, 999);
    const startIso = rangeStart.toISOString();
    const endIso = rangeEnd.toISOString();

    const { data: techRows, error: techError } = await supabase
      .from('technologies')
      .select('id, name')
      .order('name');
    if (techError) throw new Error(techError.message);

    let techNames = (techRows || []).map((t) => normalizeTechName(t.name));
    techNames = [...new Set(techNames)].sort((a, b) => a.localeCompare(b, 'es'));

    if (techFilterRaw) {
      const wanted = normalizeTechName(techFilterRaw);
      const byId = (techRows || []).find((t) => t.id === techFilterRaw);
      const match = byId ? normalizeTechName(byId.name) : wanted;
      techNames = techNames.filter((t) => t === match || t.includes(match) || match.includes(t));
      if (techNames.length === 0) techNames = [match];
    }

    const modelTech = await loadModelTechMap(supabase);
    const resolveTech = (modelId: string | null | undefined) =>
      (modelId && modelTech.get(modelId)) || 'SIN TECNOLOGÍA';

    const buckets = new Map<BucketKey, Bucket>();
    const ensure = (y: number, m: number, tech: string) => {
      const key = bucketKey(y, m, tech);
      let b = buckets.get(key);
      if (!b) {
        b = emptyBucket(y, country, m, tech);
        buckets.set(key, b);
      }
      return b;
    };

    const months = monthFilter ? [monthFilter] : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    for (const m of months) {
      for (const tech of techNames) ensure(year, m, tech);
    }

    // --- Ingresado CAC: 1 OS = 1 equipo ---
    const cacRows = await fetchPaged<{ service_order_id: string | null; classified_at: string }>(
      (from, to) =>
        supabase
          .from('cac_tray_units')
          .select('service_order_id, classified_at')
          .eq('is_active', true)
          .gte('classified_at', startIso)
          .lte('classified_at', endIso)
          .order('classified_at', { ascending: true })
          .range(from, to)
    );

    const cacOsFirstDate = new Map<string, Date>();
    for (const row of cacRows) {
      const osId = String(row.service_order_id || '');
      if (!osId) continue;
      const dt = new Date(row.classified_at);
      if (Number.isNaN(dt.getTime()) || dt.getFullYear() !== year) continue;
      const m = dt.getMonth() + 1;
      if (monthFilter && m !== monthFilter) continue;
      const prev = cacOsFirstDate.get(osId);
      if (!prev || dt < prev) cacOsFirstDate.set(osId, dt);
    }

    const cacOsIds = [...cacOsFirstDate.keys()];
    const cacOsMeta = await loadOsMeta(supabase, cacOsIds);
    const cacSeriesByOs = await loadSeriesByOsIds(supabase, cacOsIds);

    const ingresadoHits: IngresadoHit[] = [];
    const ingresadoOsSeen = new Set<string>();

    for (const [osId, dt] of cacOsFirstDate) {
      if (ingresadoOsSeen.has(osId)) continue;
      ingresadoOsSeen.add(osId);
      const m = dt.getMonth() + 1;
      const meta = cacOsMeta.get(osId);
      const seriesList = cacSeriesByOs.get(osId) || [];
      const tech = resolveTech(seriesList[0]?.model_id || meta?.modelId);
      if (techFilterRaw && !techNames.includes(tech)) continue;
      const source = sourceFromSeriesList(seriesList, 'cac');
      ingresadoHits.push({
        osId,
        seriesIds: seriesList.map((s) => s.id),
        year,
        month: m,
        tech,
        source,
      });
      const b = ensure(year, m, tech);
      if (source === 'px') b.ingresadoPx += 1;
      else b.ingresadoCac += 1;
    }

    // --- Ingresado PX: 1 OS = 1 equipo (excluye OS ya en CAC) ---
    const pxReceptions = await fetchPaged<{ id: string }>((from, to) =>
      supabase
        .from('receptions')
        .select('id')
        .eq('source', 'px')
        .gte('created_at', startIso)
        .lte('created_at', endIso)
        .order('created_at', { ascending: true })
        .range(from, to)
    );

    const pxReceptionIds = pxReceptions.map((r) => r.id).filter(Boolean);
    const cacOsSet = new Set(cacOsIds);
    const pxOsFirstDate = new Map<string, { dt: Date; modelId: string | null }>();

    for (let i = 0; i < pxReceptionIds.length; i += CHUNK) {
      const chunk = pxReceptionIds.slice(i, i + CHUNK);
      const pxOrders = await fetchPaged<{
        id: string;
        created_at: string;
        model_id: string | null;
      }>((from, to) =>
        supabase
          .from('service_orders')
          .select('id, created_at, model_id')
          .in('reception_id', chunk)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: true })
          .range(from, to)
      );

      for (const order of pxOrders) {
        const osId = String(order.id || '');
        if (!osId || cacOsSet.has(osId)) continue;
        const dt = new Date(order.created_at);
        if (Number.isNaN(dt.getTime()) || dt.getFullYear() !== year) continue;
        const m = dt.getMonth() + 1;
        if (monthFilter && m !== monthFilter) continue;
        const prev = pxOsFirstDate.get(osId);
        if (!prev || dt < prev.dt) {
          pxOsFirstDate.set(osId, { dt, modelId: order.model_id });
        }
      }
    }

    const pxOsIds = [...pxOsFirstDate.keys()];
    const pxSeriesByOs = await loadSeriesByOsIds(supabase, pxOsIds);

    for (const [osId, info] of pxOsFirstDate) {
      if (ingresadoOsSeen.has(osId)) continue;
      ingresadoOsSeen.add(osId);
      const m = info.dt.getMonth() + 1;
      const seriesList = pxSeriesByOs.get(osId) || [];
      const tech = resolveTech(seriesList[0]?.model_id || info.modelId);
      if (techFilterRaw && !techNames.includes(tech)) continue;
      const source = sourceFromSeriesList(seriesList, 'px');
      ingresadoHits.push({
        osId,
        seriesIds: seriesList.map((s) => s.id),
        year,
        month: m,
        tech,
        source,
      });
      const b = ensure(year, m, tech);
      if (source === 'px') b.ingresadoPx += 1;
      else b.ingresadoCac += 1;
    }

    // --- Taller: 1 OS = 1 (cola actual + entradas del periodo), no depende de Ingresado ---
    const tallerOsSeen = new Set<string>();
    const countTallerOs = (
      osId: string,
      month: number,
      tech: string,
      source: Source
    ) => {
      const key = `${month}|${osId}`;
      if (tallerOsSeen.has(key)) return;
      tallerOsSeen.add(key);
      const b = ensure(year, month, tech);
      if (source === 'px') b.tallerPx += 1;
      else b.tallerCac += 1;
    };

    const queueSeries = await loadCurrentWorkshopQueueSeries(supabase);
    const listoSeries = await loadListoWorkshopSeries(supabase);
    const currentTallerSeries = [...queueSeries, ...listoSeries];

    // Agrupar series actuales por OS
    const currentByOs = new Map<string, WorkshopSeriesRow[]>();
    for (const s of currentTallerSeries) {
      const osId = String(s.service_order_id || '');
      if (!osId) continue;
      const list = currentByOs.get(osId) || [];
      list.push({
        ...s,
        id: String(s.id),
        service_order_id: osId,
        model_id: s.model_id ? String(s.model_id) : null,
        current_reception_id: s.current_reception_id ? String(s.current_reception_id) : null,
        current_status: s.current_status ? String(s.current_status) : null,
        entry_source: s.entry_source ? String(s.entry_source).toLowerCase() : null,
      });
      currentByOs.set(osId, list);
    }

    for (const [osId, seriesList] of currentByOs) {
      // Snapshot: con filtro de mes van al mes pedido (alineado a contadores UI);
      // sin filtro, al mes de updated_at más reciente.
      let m: number;
      if (monthFilter) {
        m = monthFilter;
      } else {
        const latest = seriesList.reduce((acc, s) => {
          const t = new Date(s.updated_at).getTime();
          return Number.isNaN(t) ? acc : Math.max(acc, t);
        }, 0);
        const dt = latest ? new Date(latest) : null;
        if (!dt || dt.getFullYear() !== year) continue;
        m = dt.getMonth() + 1;
      }
      const tech = resolveTech(seriesList[0]?.model_id);
      if (techFilterRaw && !techNames.includes(tech)) continue;
      const source = sourceFromSeriesList(seriesList, 'cac');
      countTallerOs(osId, m, tech, source);
    }

    // Entradas a taller en el periodo (aunque ya no estén en cola)
    const entryOsDates = await loadWorkshopEntryOsByPeriod(supabase, startIso, endIso);
    const entryOsIds = [...entryOsDates.keys()].filter((id) => !currentByOs.has(id));
    const entrySeriesByOs = await loadSeriesByOsIds(supabase, entryOsIds);
    const entryOsMeta = await loadOsMeta(supabase, entryOsIds);

    for (const osId of entryOsIds) {
      const dt = entryOsDates.get(osId)!;
      if (dt.getFullYear() !== year) continue;
      const m = dt.getMonth() + 1;
      if (monthFilter && m !== monthFilter) continue;
      const seriesList = entrySeriesByOs.get(osId) || [];
      const meta = entryOsMeta.get(osId);
      const tech = resolveTech(seriesList[0]?.model_id || meta?.modelId);
      if (techFilterRaw && !techNames.includes(tech)) continue;
      const source = sourceFromSeriesList(seriesList, 'cac');
      countTallerOs(osId, m, tech, source);
    }

    // --- Obsoleto: 1 OS = 1 equipo ---
    const obsoleteSeries = await fetchPaged<{
      id: string;
      updated_at: string;
      service_order_id: string | null;
      model_id: string | null;
      current_reception_id: string | null;
      entry_source: string | null;
    }>((from, to) =>
      supabase
        .from('series')
        .select('id, updated_at, service_order_id, model_id, current_reception_id, entry_source')
        .eq('current_status', 'obsolete')
        .gte('updated_at', startIso)
        .lte('updated_at', endIso)
        .order('updated_at', { ascending: true })
        .range(from, to)
    );

    const obsoleteOsIds = [
      ...new Set(obsoleteSeries.map((s) => String(s.service_order_id || '')).filter(Boolean)),
    ];
    const obsoleteOsMeta = await loadOsMeta(supabase, obsoleteOsIds);
    const obsoleteCacOs = await loadHistoricalCacOsSet(supabase, obsoleteOsIds);
    const obsoleteReceptionIds = [
      ...[...obsoleteOsMeta.values()].map((o) => o.receptionId || ''),
      ...obsoleteSeries.map((s) => String(s.current_reception_id || '')),
    ];
    const obsoleteSources = await loadReceptionSources(supabase, obsoleteReceptionIds);
    const obsoleteOsSeen = new Set<string>();

    for (const s of obsoleteSeries) {
      const osId = String(s.service_order_id || '');
      if (!osId || obsoleteOsSeen.has(osId)) continue;
      obsoleteOsSeen.add(osId);
      const dt = new Date(s.updated_at);
      if (Number.isNaN(dt.getTime()) || dt.getFullYear() !== year) continue;
      const m = dt.getMonth() + 1;
      if (monthFilter && m !== monthFilter) continue;
      const meta = obsoleteOsMeta.get(osId);
      const tech = resolveTech(s.model_id || meta?.modelId);
      if (techFilterRaw && !techNames.includes(tech)) continue;

      let source: Source = sourceFromEntry(s.entry_source, 'cac');
      if (!s.entry_source) {
        if (obsoleteCacOs.has(osId) || cacOsSet.has(osId)) source = 'cac';
        else if (s.current_reception_id && obsoleteSources.get(String(s.current_reception_id))) {
          source = obsoleteSources.get(String(s.current_reception_id))!;
        } else if (meta?.receptionId && obsoleteSources.get(meta.receptionId)) {
          source = obsoleteSources.get(meta.receptionId)!;
        } else if (pxOsFirstDate.has(osId)) source = 'px';
      }

      const b = ensure(year, m, tech);
      if (source === 'px') b.obsoletoPx += 1;
      else b.obsoletoCac += 1;
    }

    // --- Reparado: solo quien YA avanzó de Reparación (QC + Equipo Listo). ---
    // No cuenta in_qc (aún en pestaña Reparación).
    // --- Reacondicionado: pestaña Reacondicionado (ready_to_dispatch) ---
    const reparadoOsSeen = new Set<string>();
    const reacondOsSeen = new Set<string>();

    for (const [osId, seriesList] of currentByOs) {
      const statuses = new Set(seriesList.map((s) => String(s.current_status || '')));
      const isReparado =
        statuses.has('in_validation') || statuses.has('in_central_warehouse');
      const isReacond = statuses.has('ready_to_dispatch');
      if (!isReparado && !isReacond) continue;

      let m: number;
      if (monthFilter) {
        m = monthFilter;
      } else {
        const latest = seriesList.reduce((acc, s) => {
          const t = new Date(s.updated_at).getTime();
          return Number.isNaN(t) ? acc : Math.max(acc, t);
        }, 0);
        const dt = latest ? new Date(latest) : null;
        if (!dt || dt.getFullYear() !== year) continue;
        m = dt.getMonth() + 1;
      }

      const tech = resolveTech(seriesList[0]?.model_id);
      if (techFilterRaw && !techNames.includes(tech)) continue;
      const source = sourceFromSeriesList(seriesList, 'cac');
      const b = ensure(year, m, tech);

      if (isReparado && !reparadoOsSeen.has(osId)) {
        reparadoOsSeen.add(osId);
        if (source === 'px') b.reparadoPx += 1;
        else b.reparadoCac += 1;
      }
      if (isReacond && !reacondOsSeen.has(osId)) {
        reacondOsSeen.add(osId);
        if (source === 'px') b.reacondicionadoPx += 1;
        else b.reacondicionadoCac += 1;
      }
    }

    const rows: ReportRow[] = [...buckets.values()]
      .sort((a, b) => a.month - b.month || a.tech.localeCompare(b.tech, 'es'))
      .map((b) => ({
        Año: b.year,
        País: b.country,
        Mes: MONTH_LABELS[b.month - 1],
        Tecnología: b.tech,
        'Ingresado CACs': numOrBlank(b.ingresadoCac),
        'Ingresado PX': numOrBlank(b.ingresadoPx),
        'Taller CACs': numOrBlank(b.tallerCac),
        'Taller PX': numOrBlank(b.tallerPx),
        'Obsoleto CACs': numOrBlank(b.obsoletoCac),
        'Obsoleto PX': numOrBlank(b.obsoletoPx),
        'Reparado CACs': numOrBlank(b.reparadoCac),
        'Reparado PX': numOrBlank(b.reparadoPx),
        'Reacondicionado CACs': numOrBlank(b.reacondicionadoCac),
        'Reacondicionado PX': numOrBlank(b.reacondicionadoPx),
      }));

    const metricKeys = [
      'Ingresado CACs',
      'Ingresado PX',
      'Taller CACs',
      'Taller PX',
      'Obsoleto CACs',
      'Obsoleto PX',
      'Reparado CACs',
      'Reparado PX',
      'Reacondicionado CACs',
      'Reacondicionado PX',
    ] as const;

    const hasData = rows.some((r) =>
      metricKeys.some((k) => typeof r[k] === 'number' && (r[k] as number) > 0)
    );

    return {
      rows: hasData ? rows : [],
      xlsxLayout: 'ops_monthly_tech_matrix',
    };
  }
}
