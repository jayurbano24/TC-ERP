import { TALLER_KPI_GOAL_SELECT } from '@/shared/constants/dbProjections';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Fila de movimiento por persona a lo largo del pipeline (bodega → taller → QC). */
export type PipelineUserRow = {
  usuario: string;
  bodegaIngreso: number;
  bodegaSalida: number;
  diagnostico: number;
  diagAReacondicionado: number;
  diagAReparacion: number;
  reacondicionado: number;
  reacEnviadoQC: number;
  reparacion: number;
  repEnviadoQC: number;
  controlCalidad: number;
  qcAprobado: number;
  qcDevuelto: number;
};

const KPI_TZ = 'America/Guatemala';
const PAGE = 1000;

// --- NORMALIZADOR DE TECNOLOGÍAS ---
export function normalizeTechName(raw: string | null | undefined): string {
  if (!raw) return 'EQUIPO';
  let clean = raw.split('\n')[0];
  clean = clean.replace(/Cajas:.*/gi, '').replace(/-/g, '').trim();
  clean = clean.replace(/\\N/gi, '').trim();
  clean = clean.toUpperCase();
  if (!clean || clean.length < 2) return 'EQUIPO';
  return clean;
}

function guatemalaYmd(d = new Date()): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KPI_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return { y, m, day };
}

/** Límites ISO del filtro KPI en zona America/Guatemala (UTC-6 fijo). */
function resolveTimeRangeIso(timeRange: string): { startIso: string; endIso: string } {
  const { y, m, day } = guatemalaYmd();
  const toIso = (yy: number, mm: number, dd: number, end: boolean) => {
    const hh = end ? 23 : 0;
    const mi = end ? 59 : 0;
    const ss = end ? 59 : 0;
    const ms = end ? 999 : 0;
    // Guatemala = UTC-6
    const utc = Date.UTC(yy, mm - 1, dd, hh + 6, mi, ss, ms);
    return new Date(utc).toISOString();
  };

  if (timeRange === 'Ayer') {
    const dt = new Date(Date.UTC(y, m - 1, day) - 24 * 60 * 60 * 1000);
    const p = guatemalaYmd(dt);
    return { startIso: toIso(p.y, p.m, p.day, false), endIso: toIso(p.y, p.m, p.day, true) };
  }

  if (timeRange === 'Esta Semana') {
    // Lunes de la semana actual (GT)
    const utcNoon = Date.UTC(y, m - 1, day, 18, 0, 0); // noon GT ≈
    const dow = new Date(utcNoon).getUTCDay(); // 0=dom
    const offsetMon = dow === 0 ? -6 : 1 - dow;
    const monday = new Date(Date.UTC(y, m - 1, day + offsetMon));
    const mp = guatemalaYmd(monday);
    return {
      startIso: toIso(mp.y, mp.m, mp.day, false),
      endIso: toIso(y, m, day, true),
    };
  }

  if (timeRange === 'Este Mes') {
    return { startIso: toIso(y, m, 1, false), endIso: toIso(y, m, day, true) };
  }

    // Hoy
  return { startIso: toIso(y, m, day, false), endIso: toIso(y, m, day, true) };
}

// PostgREST query builder tipado de forma laxa (encadenamiento dinámico).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SbQuery = any;

type OsWipCounts = {
  in_workshop: number;
  in_qc: number;
  in_validation: number;
  RECEPCIONADO_BODEGA_GENERAL: number;
  in_central_warehouse: number;
  in_control_warehouse: number;
  ready_to_dispatch: number;
  irreparable: number;
  scrapped: number;
  dispatched: number;
};

async function rpcOsCount(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown>
): Promise<number | null> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    if (
      error.code === 'PGRST202' ||
      error.code === '42883' ||
      /function|does not exist/i.test(error.message || '')
    ) {
      return null;
    }
    console.warn(`KPI rpc ${fn}:`, error.code || error.message);
    return null;
  }
  return Number(data ?? 0);
}

/** Cuenta OS distintos — RPC (migración 167); pageo solo fallback. */
async function countDistinctOsByStatus(
  supabase: SupabaseClient,
  status: string
): Promise<number> {
  const viaRpc = await rpcOsCount(supabase, 'count_os_by_status', { p_status: status });
  if (viaRpc != null) return viaRpc;

  const ids = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('series')
      .select('service_order_id')
      .eq('current_status', status)
      .not('service_order_id', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.warn(`KPI OS page ${status}:`, error.code || error.message || error);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.service_order_id) ids.add(row.service_order_id as string);
    }
    offset += data.length;
    if (data.length < PAGE || offset > 120_000) break;
  }
  return ids.size;
}

async function countDistinctOsInStatuses(
  supabase: SupabaseClient,
  statuses: string[]
): Promise<number> {
  const viaRpc = await rpcOsCount(supabase, 'count_os_in_statuses', { p_statuses: statuses });
  if (viaRpc != null) return viaRpc;

  const ids = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('series')
      .select('service_order_id')
      .in('current_status', statuses)
      .not('service_order_id', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.warn('KPI OS multi-status:', error.code || error.message || error);
      break;
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.service_order_id) ids.add(row.service_order_id as string);
    }
    offset += data.length;
    if (data.length < PAGE || offset > 120_000) break;
  }
  return ids.size;
}

/** OS = Detalle de Inventario (/bodega/inventario), no status crudo. */
async function countInventoryDetailOs(supabase: SupabaseClient): Promise<number> {
  const viaRpc = await rpcOsCount(supabase, 'count_inventory_detail_os', {});
  if (viaRpc != null) return viaRpc;
  return countDistinctOsInStatuses(supabase, [
    'in_central_warehouse',
    'in_control_warehouse',
  ]);
}

/** OS en bandeja CAC pendientes de ingreso a bodega (SSOT Backoffice). */
async function countCacTrayOsWip(supabase: SupabaseClient): Promise<number | null> {
  const ids = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('cac_tray_units')
      .select('service_order_id')
      .eq('is_active', true)
      .eq('unit_status', 'RECEPCIONADO_BODEGA_GENERAL')
      .not('service_order_id', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.warn('KPI CAC tray WIP:', error.code || error.message);
      return null;
    }
    if (!data?.length) break;
    for (const row of data) {
      if (row.service_order_id) ids.add(row.service_order_id as string);
    }
    offset += data.length;
    if (data.length < PAGE || offset > 120_000) break;
  }
  return ids.size;
}

/** Map series.id → service_order_id (para pasar auditorías de series a OS). */
async function mapSeriesIdsToServiceOrders(
  supabase: SupabaseClient,
  seriesIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(seriesIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data, error } = await supabase
      .from('series')
      .select('id, service_order_id')
      .in('id', chunk);
    if (error) {
      console.warn('KPI series→OS map:', error.code || error.message || error);
      continue;
    }
    for (const row of data || []) {
      if (row.id && row.service_order_id) {
        map.set(row.id as string, row.service_order_id as string);
      }
    }
  }
  return map;
}

/**
 * WIP por OS (service_order_id):
 * - mv_workshop.os_count para colas taller
 * - conteo distinto live para bodega / pendientes / despacho
 */
async function loadOsWipCounts(supabase: SupabaseClient): Promise<OsWipCounts> {
  const wip: OsWipCounts = {
    in_workshop: 0,
    in_qc: 0,
    in_validation: 0,
    RECEPCIONADO_BODEGA_GENERAL: 0,
    in_central_warehouse: 0,
    in_control_warehouse: 0,
    ready_to_dispatch: 0,
    irreparable: 0,
    scrapped: 0,
    dispatched: 0,
  };

  const { data: mvWs, error: mvWsErr } = await supabase
    .from('mv_workshop')
    .select('status, os_count');
  if (mvWsErr) {
    console.warn('KPI mv_workshop:', mvWsErr.code || mvWsErr.message || mvWsErr);
  } else {
    for (const row of mvWs || []) {
      const st = row.status as keyof OsWipCounts;
      if (st in wip) wip[st] = Number(row.os_count ?? 0);
    }
  }

  const workshopFilled =
    wip.in_workshop + wip.in_qc + wip.in_validation + wip.ready_to_dispatch > 0;
  if (!workshopFilled) {
    for (const st of [
      'in_workshop',
      'in_qc',
      'in_validation',
      'ready_to_dispatch',
      'irreparable',
      'scrapped',
      'in_control_warehouse',
    ] as const) {
      wip[st] = await countDistinctOsByStatus(supabase, st);
    }
  }

  // Pendiente ingreso + despacho: OS distintos
  wip.RECEPCIONADO_BODEGA_GENERAL = await countDistinctOsByStatus(
    supabase,
    'RECEPCIONADO_BODEGA_GENERAL'
  );
  wip.dispatched = await countDistinctOsByStatus(supabase, 'dispatched');

  // Bodega = Detalle de Inventario (cajas en bodega + OS), no series sueltas por status
  wip.in_central_warehouse = await countInventoryDetailOs(supabase);
  wip.in_control_warehouse = 0;

  return wip;
}

async function fetchAllPages<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  apply: (q: SbQuery) => SbQuery,
  maxRows = 50_000
): Promise<T[]> {
  const rows: T[] = [];
  let offset = 0;
  for (;;) {
    let q: SbQuery = supabase.from(table).select(select).range(offset, offset + PAGE - 1);
    q = apply(q);
    const { data, error } = await q;
    if (error) {
      console.warn(`KPI page ${table}:`, error.code || error.message || error);
      break;
    }
    if (!data?.length) break;
    rows.push(...(data as T[]));
    offset += data.length;
    if (data.length < PAGE || rows.length >= maxRows) break;
  }
  return rows;
}

type UserBucket = {
  registradas: number;
  cac: number;
  px: number;
  devolucionesTotales: number;
  devolucionesPendientes: number;
};

function emptyBucket(): UserBucket {
  return {
    registradas: 0,
    cac: 0,
    px: 0,
    devolucionesTotales: 0,
    devolucionesPendientes: 0,
  };
}

function normalizePersonName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** Corrige mojibake típico (RecepciÃ³n → Recepción). */
function fixDisplayText(raw: string): string {
  const s = normalizePersonName(raw)
    .replace(/RecepciÃ³n/gi, 'Recepción')
    .replace(/Ã³/g, 'ó')
    .replace(/Ã¡/g, 'á')
    .replace(/Ã©/g, 'é')
    .replace(/Ã­/g, 'í')
    .replace(/Ãº/g, 'ú')
    .replace(/Ã±/g, 'ñ')
    .replace(/Â/g, '');
  return normalizePersonName(s);
}

/** Meta diaria → semana (×5) → mes (×5 semanas). Escala según filtro KPI. */
function scalePeriodGoals(dailyGoal: number, timeRange: string) {
  const metaDiaria = dailyGoal;
  const metaSemana = dailyGoal * 5;
  const metaMes = metaSemana * 5; // ~500 si diaria=20
  if (timeRange === 'Este Mes') {
    return {
      meta: metaMes,
      semana: metaSemana,
      diaria: metaDiaria,
      bonoThreshold: metaMes,
    };
  }
  if (timeRange === 'Esta Semana') {
    return {
      meta: metaSemana,
      semana: metaSemana,
      diaria: metaDiaria,
      bonoThreshold: metaSemana,
    };
  }
  return {
    meta: metaDiaria,
    semana: metaSemana,
    diaria: metaDiaria,
    bonoThreshold: metaDiaria,
  };
}

function isEmailLike(value: string): boolean {
  return value.includes('@');
}

function emailLocalPart(email: string): string {
  return email.split('@')[0]?.trim().toLowerCase() || '';
}

/** Quita acentos/puntuación para comparar Johanna ≈ johanna, etc. */
function foldKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

type PersonResolver = {
  resolve: (raw: string | null | undefined) => string;
};

/**
 * Homologa nombre ↔ correo usando profiles + employees.
 * Ej: jsanchez@… y "JOSHUA MISAEL…" → mismo display name.
 */
function buildPersonResolver(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profiles: any[] | null | undefined
): PersonResolver {
  const emailToName = new Map<string, string>();
  const localToName = new Map<string, string>();
  const foldedNameToDisplay = new Map<string, string>();

  for (const p of profiles || []) {
    const emp = Array.isArray(p.employees)
      ? p.employees[0]?.nombre_completo
      : p.employees?.nombre_completo;
    const full = typeof p.full_name === 'string' ? p.full_name.trim() : '';
    const email = typeof p.email === 'string' ? p.email.trim().toLowerCase() : '';

    let display =
      (typeof emp === 'string' && emp.trim()) ||
      (full && !isEmailLike(full) ? full : '') ||
      (email ? email.split('@')[0] : '') ||
      'Desconocido';
    display = normalizePersonName(display);

    if (email) {
      emailToName.set(email, display);
      const local = emailLocalPart(email);
      if (local) localToName.set(local, display);
    }
    if (full && isEmailLike(full)) {
      emailToName.set(full.toLowerCase(), display);
      const local = emailLocalPart(full);
      if (local) localToName.set(local, display);
    }
    foldedNameToDisplay.set(foldKey(display), display);
    if (full && !isEmailLike(full)) {
      foldedNameToDisplay.set(foldKey(full), display);
    }
  }

  const localMatchesName = (local: string, foldedName: string): boolean => {
    if (local.length < 3) return false;
    const initial = local[0];
    const surname = local.slice(1); // jsanchez → sanchez
    const tokens = foldedName.split(/\s+/).filter(Boolean);
    const surnameHit = tokens.some(
      (t) => t === surname || t.startsWith(surname) || surname.startsWith(t)
    );
    const initialHit = tokens.some((t) => t.startsWith(initial));
    return surnameHit && initialHit;
  };

  const resolve = (raw: string | null | undefined): string => {
    const trimmed = normalizePersonName(raw || '');
    if (
      !trimmed ||
      trimmed.toLowerCase() === 'sin nombre' ||
      trimmed.toLowerCase() === 'sin clasificador' ||
      trimmed === '—'
    ) {
      return 'Sin clasificador';
    }
    if (isEmailLike(trimmed)) {
      const byEmail = emailToName.get(trimmed.toLowerCase());
      if (byEmail) return byEmail;
      const local = emailLocalPart(trimmed);
      const byLocal = localToName.get(local);
      if (byLocal) return byLocal;
      // Correo sin profile: intentar empatar con un nombre canónico ya visto
      for (const [folded, display] of foldedNameToDisplay) {
        if (localMatchesName(local, folded)) return display;
      }
      return normalizePersonName(local || trimmed);
    }

    const folded = foldKey(trimmed);
    if (foldedNameToDisplay.has(folded)) return foldedNameToDisplay.get(folded)!;

    // Nombre completo → correo local (jsanchez ↔ JOSHUA … SANCHEZ …)
    for (const [local, display] of localToName) {
      if (localMatchesName(local, folded)) return display;
    }

    return trimmed;
  };

  return { resolve };
}

function mergeUserBuckets(
  source: Record<string, UserBucket>,
  resolve: (raw: string) => string
): Record<string, UserBucket> {
  const merged: Record<string, UserBucket> = {};
  for (const [rawKey, bucket] of Object.entries(source)) {
    const key = resolve(rawKey);
    if (!merged[key]) merged[key] = emptyBucket();
    const t = merged[key];
    t.registradas += bucket.registradas;
    t.cac += bucket.cac;
    t.px += bucket.px;
    t.devolucionesTotales += bucket.devolucionesTotales;
    t.devolucionesPendientes += bucket.devolucionesPendientes;
  }
  return merged;
}

export async function getEngineKPIs(timeRange: string = 'Hoy') {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const { startIso, endIso } = resolveTimeRangeIso(timeRange);
  const weekRange = resolveTimeRangeIso('Esta Semana');
  const inRange = (q: SbQuery, col = 'created_at'): SbQuery =>
    q.gte(col, startIso).lte(col, endIso);

  const { data: usersData } = await supabase
    .from('profiles')
    .select('id, full_name, email, user_roles(role), employees(nombre_completo)')
    .eq('is_active', true);

  const personResolver = buildPersonResolver(usersData);

  const getUserName = (id: string) => {
    const userRow = usersData?.find((u) => u.id === id);
    if (!userRow) return 'Desconocido';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = userRow as any;
    let realName = u.full_name || u.email || 'Desconocido';
    if (u.employees && Array.isArray(u.employees) && u.employees[0]?.nombre_completo) {
      realName = u.employees[0].nombre_completo;
    } else if (u.employees && !Array.isArray(u.employees) && u.employees.nombre_completo) {
      realName = u.employees.nombre_completo;
    }
    return personResolver.resolve(realName);
  };

  // ---- 1. Recepción general: cajas físicas (boxes) + unidades clasificadas ----
  type BoxRow = {
    id: string;
    reception_id?: string | null;
    received_units?: number;
    receptions?: {
      source?: string | null;
      status?: string | null;
      received_units?: number | null;
      received_by?: string | null;
      notes?: string | null;
    } | null;
  };

  const resolveBoxChannel = (b: BoxRow): 'cac' | 'px' => {
    const src = (b.receptions?.source || '').toLowerCase().trim();
    if (src === 'px' || src === 'planta_externa' || src === 'planta externa') return 'px';
    if (src === 'cac') return 'cac';
    const notes = (b.receptions?.notes || '').toLowerCase();
    if (
      /\b(source|origen)\s*[:=]\s*px\b/.test(notes) ||
      notes.includes('planta externa') ||
      notes.includes('recepción px') ||
      notes.includes('recepcion px')
    ) {
      return 'px';
    }
    return 'cac';
  };

  const boxesInPeriod = await fetchAllPages<BoxRow>(
    supabase,
    'boxes',
    'id, reception_id, receptions:reception_id(source, status, received_units, received_by, notes)',
    (q) => inRange(q).not('rack_location', 'eq', 'ELIMINADO')
  );

  let origenCac = 0;
  let origenPx = 0;
  let cajasEquipos = 0;
  let cajasAccesorios = 0;
  let cajasMoviles = 0;

  for (const b of boxesInPeriod) {
    if (resolveBoxChannel(b) === 'px') origenPx++;
    else origenCac++;
    cajasEquipos++; // las cajas de flujo principal son equipos
  }

  const cajasRecibidasHoy = origenCac + origenPx;

  // Unidades (equipos) del periodo: bandeja CAC (OS). Canal PX/CAC se resuelve aparte.
  const trayRows = await fetchAllPages<{
    service_order_id: string | null;
    received_by_name: string | null;
    reception_id: string | null;
    unit_status: string | null;
    unit_status_label: string | null;
    tech_id: string | null;
    classified_at: string | null;
  }>(
    supabase,
    'cac_tray_units',
    'service_order_id, received_by_name, reception_id, unit_status, unit_status_label, tech_id, classified_at',
    (q) => inRange(q, 'classified_at').eq('is_active', true)
  );

  const cacUnits = trayRows.length;

  const pxReceptions = await fetchAllPages<{
    id: string;
    received_units: number | null;
    notes: string | null;
    status: string | null;
    source: string | null;
    received_by: string | null;
  }>(
    supabase,
    'receptions',
    'id, received_units, notes, status, source, received_by',
    (q) =>
      inRange(q)
        .eq('source', 'px')
        .not('status', 'in', '(ELIMINADO,ELIMINADO POR BODEGA)')
  );

  let pxUnits = 0;
  for (const r of pxReceptions) {
    pxUnits += r.received_units && r.received_units > 0 ? r.received_units : 1;
  }

  const totalUnidades = cacUnits + pxUnits;

  // Breakdown equipos/accesorios/móviles desde notes de recepciones del periodo
  const receptionsPeriod = await fetchAllPages<{
    id: string;
    source: string | null;
    notes: string | null;
    received_units: number | null;
    status: string | null;
  }>(
    supabase,
    'receptions',
    'id, source, notes, received_units, status',
    (q) => inRange(q).not('status', 'in', '(ELIMINADO,ELIMINADO POR BODEGA)')
  );

  cajasEquipos = 0;
  cajasAccesorios = 0;
  cajasMoviles = 0;
  for (const r of receptionsPeriod) {
    const lower = (r.notes || '').toLowerCase();
    if (
      lower.includes('backoffice_tech: móviles') ||
      lower.includes('backoffice_category: teléfono') ||
      lower.includes('backoffice_category: telefono')
    ) {
      cajasMoviles++;
    } else if (
      lower.includes('backoffice_tech: accesorios') ||
      lower.includes('backoffice_category: accesorio')
    ) {
      cajasAccesorios++;
    } else {
      cajasEquipos++;
    }
  }
  // Si no hay notes útiles, alinear breakdown con cajas CAC/PX
  if (cajasEquipos + cajasAccesorios + cajasMoviles === 0 && cajasRecibidasHoy > 0) {
    cajasEquipos = cajasRecibidasHoy;
  }

  // Solo origen CAC/PX = cajas físicas del periodo (tabla boxes).
  // No mezclar couriers/# guías aquí: confunde con pendientes y no es el mismo dato.
  const ingresosTable = [
    {
      courier: 'CAC',
      cajas: origenCac,
      procesadasHoy: origenCac,
      acumulada: cacUnits,
      grupo: 'origen' as const,
    },
    {
      courier: 'PX',
      cajas: origenPx,
      procesadasHoy: origenPx,
      acumulada: pxUnits,
      grupo: 'origen' as const,
    },
  ];

  // ---- WIP por OS (nunca por filas de series) ----
  const osWip = await loadOsWipCounts(supabase);
  const wipInWorkshop = osWip.in_workshop;
  const wipInQc = osWip.in_qc;
  const wipInValidation = osWip.in_validation;
  const wipRecepcionadoBodega = osWip.RECEPCIONADO_BODEGA_GENERAL;
  const wipCentral = osWip.in_central_warehouse;
  const wipControl = osWip.in_control_warehouse;
  const wipReady = osWip.ready_to_dispatch;
  const wipIrreparable = osWip.irreparable;
  const wipScrapped = osWip.scrapped;
  const wipDispatched = osWip.dispatched;

  const bodegaInventarioCount = wipCentral + wipControl;
  const backofficePendientesIngreso = wipRecepcionadoBodega;
  const backofficeEnValidacion = wipInValidation;

  // ---- 2. Backoffice (solo OS/equipos; cajas viven en Recepción) ----
  // OS CAC = bandeja (received_by_name). Un usuario de bandeja NO recibe OS PX.
  // OS PX  = solo recepciones source=px atribuidas a received_by / "Recibido Por:"
  //          Nunca usar "CLASIFICACIÓN … Por:" (eso es bandeja/backoffice, no ingreso PX).
  const backofficeCountsRaw: Record<string, UserBucket> = {};

  const bumpUser = (name: string, patch: Partial<UserBucket>) => {
    const key = personResolver.resolve(name);
    if (!backofficeCountsRaw[key]) backofficeCountsRaw[key] = emptyBucket();
    const b = backofficeCountsRaw[key];
    if (patch.registradas) b.registradas += patch.registradas;
    if (patch.cac) b.cac += patch.cac;
    if (patch.px) b.px += patch.px;
    if (patch.devolucionesTotales) b.devolucionesTotales += patch.devolucionesTotales;
    if (patch.devolucionesPendientes) b.devolucionesPendientes += patch.devolucionesPendientes;
  };

  /** Solo operador de ingreso PX (no clasificador de timeline). */
  const pxIngressOperator = (r: {
    received_by: string | null;
    notes: string | null;
  }): string => {
    if (r.received_by) {
      const resolved = getUserName(r.received_by);
      if (resolved && resolved !== 'Desconocido' && resolved !== r.received_by) return resolved;
      // si getUserName no resolvió, puede ser nombre ya legible
      if (!/^[0-9a-f-]{36}$/i.test(r.received_by.trim())) return r.received_by.trim();
    }
    const recibido = r.notes?.match(/Recibido Por:\s*([^\n]+)/i)?.[1]?.trim();
    if (recibido) return recibido.split('@')[0].trim();
    return 'Sin clasificador';
  };

  const pxOperatorByReceptionId = new Map<string, string>();
  for (const r of pxReceptions) {
    pxOperatorByReceptionId.set(r.id, pxIngressOperator(r));
  }

  const trayOsIds = new Set<string>();
  /** Usuarios que trabajaron bandeja CAC este periodo (no deben llevar OS PX). */
  const cacTrayUsers = new Set<string>();

  for (const row of trayRows) {
    if (row.service_order_id) trayOsIds.add(row.service_order_id);
    const name = row.received_by_name || 'Sin clasificador';
    cacTrayUsers.add(personResolver.resolve(name));
    const statusLabel = `${row.unit_status || ''} ${row.unit_status_label || ''}`.toLowerCase();
    const isDev =
      statusLabel.includes('devol') ||
      statusLabel.includes('return') ||
      statusLabel.includes('rechaz');
    bumpUser(name, {
      registradas: 1,
      cac: 1,
      devolucionesTotales: isDev ? 1 : 0,
      devolucionesPendientes: isDev ? 1 : 0,
    });
  }

  // OS vía PX fuera de bandeja → solo a quien ingresó PX
  const pxReceptionIds = pxReceptions.map((r) => r.id).filter(Boolean);
  if (pxReceptionIds.length > 0) {
    const pxOrders: { id: string; reception_id: string | null }[] = [];
    for (let i = 0; i < pxReceptionIds.length; i += 200) {
      const chunk = pxReceptionIds.slice(i, i + 200);
      const page = await fetchAllPages<{ id: string; reception_id: string | null }>(
        supabase,
        'service_orders',
        'id, reception_id',
        (q) => inRange(q).in('reception_id', chunk)
      );
      pxOrders.push(...page);
    }
    for (const os of pxOrders) {
      if (!os.id || trayOsIds.has(os.id)) continue;
      let name = os.reception_id
        ? pxOperatorByReceptionId.get(os.reception_id) || 'Sin clasificador'
        : 'Sin clasificador';
      // Si el "operador" es alguien de bandeja CAC, no mezclar canales: va a Sin clasificador
      if (cacTrayUsers.has(personResolver.resolve(name))) {
        name = 'Sin clasificador';
      }
      bumpUser(name, { registradas: 1, px: 1 });
    }
  }

  // Devoluciones PX: mismo operador de ingreso (no clasificador de bandeja)
  for (const r of pxReceptions) {
    let name = pxOperatorByReceptionId.get(r.id) || 'Sin clasificador';
    if (cacTrayUsers.has(personResolver.resolve(name))) name = 'Sin clasificador';
    const nLower = (r.notes || '').toLowerCase();
    if (
      nLower.includes('motivo devolución') ||
      nLower.includes('devolución') ||
      nLower.includes('backoffice_category')
    ) {
      bumpUser(name, {
        devolucionesTotales: 1,
        devolucionesPendientes: r.status !== 'DESPACHADO' ? 1 : 0,
      });
    }
  }

  const backofficeCountsByUser = mergeUserBuckets(backofficeCountsRaw, personResolver.resolve);

  // Un usuario = un canal. Si quedara mezcla, se queda el canal mayoritario y el resto a Sin clasificador.
  let spillPx = 0;
  let spillCac = 0;
  for (const [usuario, bucket] of Object.entries(backofficeCountsByUser)) {
    if (bucket.px > 0 && bucket.cac > 0) {
      if (bucket.cac >= bucket.px) {
        spillPx += bucket.px;
        bucket.registradas -= bucket.px;
        bucket.px = 0;
      } else {
        spillCac += bucket.cac;
        bucket.registradas -= bucket.cac;
        bucket.cac = 0;
      }
    }
    // Alinear totales
    bucket.registradas = bucket.px + bucket.cac;
    if (usuario === 'Sin clasificador') {
      /* spills se aplican abajo */
    }
  }
  if (spillPx > 0 || spillCac > 0) {
    if (!backofficeCountsByUser['Sin clasificador']) {
      backofficeCountsByUser['Sin clasificador'] = emptyBucket();
    }
    const u = backofficeCountsByUser['Sin clasificador'];
    u.px += spillPx;
    u.cac += spillCac;
    u.registradas = u.px + u.cac;
  }

  const registradasHoyTotal = Object.values(backofficeCountsByUser).reduce(
    (acc, d) => acc + d.registradas,
    0
  );
  const devolucionesPendientesTotal = Object.values(backofficeCountsByUser).reduce(
    (acc, d) => acc + d.devolucionesPendientes,
    0
  );

  const registroTable = Object.keys(backofficeCountsByUser)
    .map((usuario) => ({
      usuario,
      registradas: backofficeCountsByUser[usuario].registradas,
      totales: backofficeCountsByUser[usuario].registradas,
      tecnologia: '—', 
      estado: 'Ok',
    }))
    .filter((u) => u.registradas > 0)
    .sort((a, b) => b.registradas - a.registradas);

  if (registroTable.length === 0) {
    registroTable.push({
      usuario: 'Sin registros',
      registradas: 0,
      totales: 0,
      tecnologia: '—',
      estado: 'Ok',
    });
  }

  const devolucionesTable = Object.keys(backofficeCountsByUser)
    .map((usuario) => {
      const d = backofficeCountsByUser[usuario];
      return {
        usuario,
        devoluciones: d.devolucionesPendientes,
        totales: d.devolucionesTotales,
        estado: 'Ok',
      };
    })
    .filter((u) => u.totales > 0 || u.devoluciones > 0)
    .sort((a, b) => b.totales - a.totales);

  if (devolucionesTable.length === 0) {
    devolucionesTable.push({
      usuario: 'Sin registros',
      devoluciones: 0,
      totales: 0,
      estado: 'Ok',
    });
  }

  const totalesTable = Object.keys(backofficeCountsByUser)
    .map((usuario) => {
      const d = backofficeCountsByUser[usuario];
      return {
        usuario,
        tecnico: usuario,
        registradas: d.registradas,
        logrado: d.registradas,
        meta: 100,
        px: d.px,
        cac: d.cac,
      };
    })
    .filter((u) => u.registradas > 0 || u.px > 0 || u.cac > 0)
    .sort((a, b) => b.registradas - a.registradas || b.cac + b.px - (a.cac + a.px));

  if (totalesTable.length === 0) {
    totalesTable.push({
      usuario: 'Sin registros',
      tecnico: 'Sin registros',
      registradas: 0,
      logrado: 0,
      meta: 0,
      px: 0,
      cac: 0,
    });
  }

  // Tecnología = equipos (OS) clasificados en Backoffice (bandeja CAC), no cajas de recepción
  const { data: techRows } = await supabase.from('technologies').select('id, name');
  const techNameById = new Map<string, string>(
    (techRows || []).map((t) => [t.id as string, normalizeTechName(t.name as string)])
  );

  const backofficeTechStats: Record<
    string,
    { ingresada: number; acumuladaSemana: number; acumuladaMes: number; unidad: string; origen: string }
  > = {};
  for (const row of trayRows) {
    const tName = row.tech_id
      ? techNameById.get(row.tech_id) || 'SIN TECNOLOGÍA'
      : 'SIN TECNOLOGÍA';
    if (!backofficeTechStats[tName]) {
      backofficeTechStats[tName] = {
        ingresada: 0,
        acumuladaSemana: 0,
        acumuladaMes: 0,
        unidad: 'OS',
        origen: 'Backoffice',
      };
    }
    backofficeTechStats[tName].ingresada += 1;
    backofficeTechStats[tName].acumuladaMes += 1;
    const at = row.classified_at ? new Date(row.classified_at).toISOString() : '';
    if (at && at >= weekRange.startIso && at <= weekRange.endIso) {
      backofficeTechStats[tName].acumuladaSemana += 1;
    }
  }
  const backofficeTechTable = Object.keys(backofficeTechStats)
    .map((t) => ({ tecnologia: t, ...backofficeTechStats[t] }))
    .filter((t) => t.ingresada > 0)
    .sort((a, b) => b.ingresada - a.ingresada);

  // ---- 3. Bodega: warehouse_movements + boxes + WIP exacto ----
  type MovRow = {
    id: string;
    movement_type: string;
    performed_by: string | null;
    performed_by_name: string | null;
    series_count: number | null;
    box_id: string | null;
    series_ids: string[] | null;
  };

  const isGenericBodegaOperatorName = (name?: string | null): boolean => {
    const n = String(name || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (!n) return true;
    if (n === 'operador' || n === 'sistema' || n === 'sin operador' || n === 'n/a') return true;
    if (n.startsWith('operador (')) return true; // "Operador (Recepción)", "Operador (Pistoleo…)"
    if (n.startsWith('sistema (')) return true;
    if (n.includes('backfill')) return true;
    if (/^[0-9a-f-]{36}$/i.test(n)) return true;
    return false;
  };

  const movements = await fetchAllPages<MovRow>(
    supabase,
    'warehouse_movements',
    'id, movement_type, performed_by, performed_by_name, series_count, box_id, series_ids',
    (q) => inRange(q)
  );

  const ingresoBoxIds = new Set<string>();
  const trasladoSeriesIds = new Set<string>();
  const salidaSeriesIds = new Set<string>();

  for (const m of movements) {
    if (m.movement_type === 'INGRESO') {
      if (m.box_id) ingresoBoxIds.add(m.box_id);
    } else if (m.movement_type === 'TRASLADO' || m.movement_type === 'DISPERSION_CAJA') {
      for (const sid of m.series_ids || []) trasladoSeriesIds.add(sid);
    } else if (m.movement_type === 'SALIDA') {
      for (const sid of m.series_ids || []) salidaSeriesIds.add(sid);
    }
  }

  /**
   * BOX recibidas = cajas distintas ingresadas a Bodega central en el mes
   * (warehouse_movements.INGRESO → bodega_central), desglose CAC/PX por recepción.
   * Complemento: cajas PX/CAC que quedaron en rack BODEGA_CENTRAL/P-* en el mes
   * sin movimiento INGRESO (flujo PX directo).
   */
  const monthBounds = resolveTimeRangeIso('Este Mes');
  type BodegaBoxLite = {
    id: string;
    reception_id: string | null;
    rack_location?: string | null;
  };
  type RecChannel = {
    source: string | null;
    status: string | null;
    received_by: string | null;
    notes: string | null;
  };

  const channelFromReception = (rec: RecChannel | undefined): 'cac' | 'px' => {
    if (!rec) return 'cac';
    const src = (rec.source || '').toLowerCase().trim();
    if (src === 'px' || src === 'planta_externa' || src === 'planta externa') return 'px';
    if (src === 'cac') return 'cac';
    const notes = (rec.notes || '').toLowerCase();
    if (
      /\b(source|origen)\s*[:=]\s*px\b/.test(notes) ||
      notes.includes('planta externa') ||
      notes.includes('recepción px') ||
      notes.includes('recepcion px')
    ) {
      return 'px';
    }
    return 'cac';
  };

  const isEliminatedReception = (status: string | null | undefined) => {
    const s = (status || '').toUpperCase();
    return s.includes('ELIMINADO');
  };

  const ingresedBoxIds = new Set<string>(ingresoBoxIds);
  /** Preferencia: performed_by UUID → nombre real; ignora "Operador (…)" genéricos. */
  const ingresoUserIdByBox = new Map<string, string>();
  const ingresoNameHintByBox = new Map<string, string>();

  const monthIngresos = await fetchAllPages<MovRow>(
    supabase,
    'warehouse_movements',
    'id, movement_type, performed_by, performed_by_name, series_count, box_id, series_ids',
    (q) =>
      q
        .gte('created_at', monthBounds.startIso)
        .lte('created_at', monthBounds.endIso)
        .eq('movement_type', 'INGRESO')
  );
  for (const m of monthIngresos) {
    if (!m.box_id) continue;
    ingresedBoxIds.add(m.box_id);
    if (m.performed_by && !ingresoUserIdByBox.has(m.box_id)) {
      ingresoUserIdByBox.set(m.box_id, m.performed_by);
    }
    const hint = fixDisplayText(m.performed_by_name || '');
    if (hint && !isGenericBodegaOperatorName(hint) && !ingresoNameHintByBox.has(m.box_id)) {
      ingresoNameHintByBox.set(m.box_id, hint);
    }
  }

  // Cajas del mes ya en rack de Bodega central sin fila INGRESO (p. ej. cierre PX).
  type BodegaBoxMeta = BodegaBoxLite & { assigned_operator_id?: string | null };
  const boxesInCentralMonth = await fetchAllPages<BodegaBoxMeta>(
    supabase,
    'boxes',
    'id, reception_id, rack_location, assigned_operator_id',
    (q) =>
      q
        .gte('created_at', monthBounds.startIso)
        .lte('created_at', monthBounds.endIso)
        .or('rack_location.eq.BODEGA_CENTRAL,rack_location.like.P-*')
  );
  for (const b of boxesInCentralMonth) {
    ingresedBoxIds.add(b.id);
  }

  const boxIdsList = [...ingresedBoxIds];
  const boxMetaById = new Map<string, BodegaBoxMeta>();
  for (let i = 0; i < boxIdsList.length; i += 200) {
    const chunk = boxIdsList.slice(i, i + 200);
    const { data: boxRows } = await supabase
      .from('boxes')
      .select('id, reception_id, rack_location, assigned_operator_id')
      .in('id', chunk);
    for (const b of boxRows || []) {
      boxMetaById.set(b.id as string, {
        id: b.id as string,
        reception_id: (b.reception_id as string | null) ?? null,
        rack_location: (b.rack_location as string | null) ?? null,
        assigned_operator_id: (b.assigned_operator_id as string | null) ?? null,
      });
    }
  }
  for (const b of boxesInCentralMonth) {
    if (!boxMetaById.has(b.id)) boxMetaById.set(b.id, b);
  }

  const receptionIds = [
    ...new Set(
      [...boxMetaById.values()].map((b) => b.reception_id).filter(Boolean) as string[]
    ),
  ];
  const receptionById = new Map<string, RecChannel>();
  for (let i = 0; i < receptionIds.length; i += 200) {
    const chunk = receptionIds.slice(i, i + 200);
    const { data: recs } = await supabase
      .from('receptions')
      .select('id, source, status, received_by, notes')
      .in('id', chunk);
    for (const r of recs || []) {
      receptionById.set(r.id as string, {
        source: (r.source as string | null) ?? null,
        status: (r.status as string | null) ?? null,
        received_by: (r.received_by as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
      });
    }
  }

  // Audit INGRESO BODEGA → user_id real cuando el movimiento solo tiene placeholder.
  const auditUserByBox = new Map<string, string>();
  {
    const seriesToBox = new Map<string, string>();
    for (let i = 0; i < boxIdsList.length; i += 40) {
      const chunk = boxIdsList.slice(i, i + 40);
      const { data: seriesRows } = await supabase
        .from('series')
        .select('id, current_box_id')
        .in('current_box_id', chunk)
        .limit(Math.min(chunk.length * 3, 300));
      for (const s of seriesRows || []) {
        const sid = s.id as string;
        const bid = s.current_box_id as string;
        if (sid && bid && !seriesToBox.has(sid)) seriesToBox.set(sid, bid);
      }
    }
    const auditIds = [...new Set([...seriesToBox.keys(), ...boxIdsList])];
    for (let i = 0; i < auditIds.length; i += 80) {
      const chunk = auditIds.slice(i, i + 80);
      const { data: logs } = await supabase
        .from('erp_audit_logs')
        .select('record_id, user_id')
        .eq('action', 'INGRESO BODEGA')
        .in('record_id', chunk)
        .limit(400);
      for (const log of logs || []) {
        const uid = log.user_id as string | null;
        if (!uid) continue;
        const rid = log.record_id as string;
        const boxId = seriesToBox.get(rid) || (ingresedBoxIds.has(rid) ? rid : null);
        if (boxId && !auditUserByBox.has(boxId)) auditUserByBox.set(boxId, uid);
      }
    }
  }

  const resolveIngresoUsuario = (boxId: string, rec: RecChannel | undefined): string => {
    const tryUserId = (id?: string | null): string | null => {
      if (!id) return null;
      const resolved = getUserName(id);
      if (resolved && resolved !== 'Desconocido' && !isGenericBodegaOperatorName(resolved)) {
        return resolved;
      }
      return null;
    };

    const fromMovUser = tryUserId(ingresoUserIdByBox.get(boxId));
    if (fromMovUser) return fromMovUser;

    const assigned = tryUserId(boxMetaById.get(boxId)?.assigned_operator_id);
    if (assigned) return assigned;

    const fromAudit = tryUserId(auditUserByBox.get(boxId));
    if (fromAudit) return fromAudit;

    const hint = ingresoNameHintByBox.get(boxId);
    if (hint && !isGenericBodegaOperatorName(hint)) return hint;

    const receivedBy = rec?.received_by?.trim();
    if (receivedBy) {
      const asProfile = tryUserId(receivedBy);
      if (asProfile) return asProfile;
      if (!/^[0-9a-f-]{36}$/i.test(receivedBy) && !isGenericBodegaOperatorName(receivedBy)) {
        return fixDisplayText(receivedBy);
      }
    }

    const fromNotes = rec?.notes?.match(/Recibido Por:\s*([^\n]+)/i)?.[1]?.trim();
    if (fromNotes && !isGenericBodegaOperatorName(fromNotes)) {
      const asProfile = tryUserId(fromNotes);
      if (asProfile) return asProfile;
      return fixDisplayText(fromNotes.split('@')[0].trim());
    }

    return 'Sin operador';
  };

  let ingresadasCac = 0;
  let ingresadasPx = 0;
  const mergedIngresoUsers = new Map<string, { cac: Set<string>; px: Set<string> }>();

  for (const boxId of ingresedBoxIds) {
    const b = boxMetaById.get(boxId);
    const rec = b?.reception_id ? receptionById.get(b.reception_id) : undefined;
    if (isEliminatedReception(rec?.status)) continue;

    const channel = channelFromReception(rec);
    if (channel === 'px') ingresadasPx++;
    else ingresadasCac++;

    const usuario = resolveIngresoUsuario(boxId, rec);

    if (!mergedIngresoUsers.has(usuario)) {
      mergedIngresoUsers.set(usuario, { cac: new Set(), px: new Set() });
    }
    const bucket = mergedIngresoUsers.get(usuario)!;
    if (channel === 'px') bucket.px.add(boxId);
    else bucket.cac.add(boxId);
  }

  const bodegaIngresosUnicos = ingresadasCac + ingresadasPx;

  const movSeriesForOs = [...trasladoSeriesIds, ...salidaSeriesIds];
  const movSeriesToOs = await mapSeriesIdsToServiceOrders(supabase, movSeriesForOs);
  const trasladoOs = new Set<string>();
  for (const sid of trasladoSeriesIds) {
    const os = movSeriesToOs.get(sid);
    if (os) trasladoOs.add(os);
  }
  const salidaOs = new Set<string>();
  for (const sid of salidaSeriesIds) {
    const os = movSeriesToOs.get(sid);
    if (os) salidaOs.add(os);
  }

  const bodegaIngresosTable = [...mergedIngresoUsers.entries()]
    .map(([usuario, v]) => ({
      usuario,
      ingresadas: v.cac.size + v.px.size,
      cac: v.cac.size,
      px: v.px.size,
      tecnologia: `${v.cac.size} CAC · ${v.px.size} PX`,
      estado: 'Ok' as const,
    }))
    .filter((r) => r.ingresadas > 0)
    .sort((a, b) => b.ingresadas - a.ingresadas);

  // Pendientes por tecnología = detalle Historial Backoffice (OS en bandeja)
  const pendingTrayRows = await fetchAllPages<{
    service_order_id: string | null;
    tech_id: string | null;
    unit_status: string | null;
    unit_status_label: string | null;
  }>(
    supabase,
    'cac_tray_units',
    'service_order_id, tech_id, unit_status, unit_status_label',
    (q) =>
      q
        .eq('is_active', true)
        .in('unit_status', ['RECEPCIONADO_BODEGA_GENERAL', 'in_validation'])
  );

  type PendTech = {
    tecnologia: string;
    bandeja: string;
    ingresadas: number;
    pendientes: number;
    estado: string;
  };
  const pendByTech = new Map<string, PendTech>();
  for (const row of pendingTrayRows) {
    const tName = row.tech_id
      ? techNameById.get(row.tech_id) || 'SIN TECNOLOGÍA'
      : 'SIN TECNOLOGÍA';
    const isIngreso = row.unit_status === 'RECEPCIONADO_BODEGA_GENERAL';
    const bandeja = isIngreso ? 'Pendiente ingreso bodega' : 'En validación backoffice';
    const key = `${tName}||${bandeja}`;
    if (!pendByTech.has(key)) {
      pendByTech.set(key, {
        tecnologia: tName,
        bandeja,
        ingresadas: 0,
        pendientes: 0,
        estado: 'Alerta',
      });
    }
    pendByTech.get(key)!.pendientes += 1;
  }
  let bodegaPendientesTable = [...pendByTech.values()].sort(
    (a, b) => b.pendientes - a.pendientes
  );
  if (bodegaPendientesTable.length === 0) {
    bodegaPendientesTable = [
      {
        tecnologia: '—',
        bandeja: 'Pendiente ingreso bodega',
        ingresadas: 0,
        pendientes: backofficePendientesIngreso,
        estado: backofficePendientesIngreso > 0 ? 'Alerta' : 'Ok',
      },
      {
        tecnologia: '—',
        bandeja: 'En validación backoffice',
        ingresadas: 0,
        pendientes: backofficeEnValidacion,
        estado: backofficeEnValidacion > 0 ? 'Alerta' : 'Ok',
      },
    ];
  }

  // ---- 4. Taller: auditorías paginadas + WIP correcto ----
  type AuditRow = {
    user_id: string | null;
    action: string;
    new_values: { result?: string } | null;
    record_id: string | null;
  };

  const auditTaller = await fetchAllPages<AuditRow>(
    supabase,
    'erp_audit_logs',
    'user_id, action, new_values, record_id',
    (q) =>
      inRange(q).in('action', [
        'DIAGNÓSTICO INICIAL COMPLETADO',
        'REACONDICIONADO COMPLETADO',
        'REPARACIÓN COMPLETADA',
        'CONTROL DE CALIDAD COMPLETADO',
      ])
  );

  let kpiGoals: { role?: string; daily_goal?: number }[] = [];
  try {
    const { data } = await supabase.from('taller_kpi_goals').select(TALLER_KPI_GOAL_SELECT);
    if (data) kpiGoals = data;
  } catch {
    /* optional table */
  }

  const goalFor = (role: string, fallback: number) => {
    const g = kpiGoals.find((x) => (x.role || '').toLowerCase() === role.toLowerCase());
    return g?.daily_goal ?? fallback;
  };

  // Auditoría taller apunta a series.id → convertir a service_order_id (1 OS)
  const auditSeriesIds = auditTaller
    .map((a) => a.record_id)
    .filter((id): id is string => Boolean(id));
  const seriesToOs = await mapSeriesIdsToServiceOrders(supabase, auditSeriesIds);

  const getUniqueOsCounts = (
    logs: AuditRow[],
    action: string,
    excludeRejects = false,
    requireRejects = false
  ) => {
    const filtered = logs.filter((a) => {
      if (a.action !== action) return false;
      if (excludeRejects && a.new_values?.result === 'rechazado_qc') return false;
      if (requireRejects && a.new_values?.result !== 'rechazado_qc') return false;
      return true;
    });
    const userMap: Record<string, Set<string>> = {};
    const globalUniques = new Set<string>();
    filtered.forEach((log) => {
      const osId =
        (log.record_id && seriesToOs.get(log.record_id)) ||
        log.record_id ||
        null;
      if (!osId) return;
      const uName = log.user_id ? getUserName(log.user_id) : 'Desconocido';
      if (!userMap[uName]) userMap[uName] = new Set();
      userMap[uName].add(osId);
      globalUniques.add(osId);
    });
    return { userMap, total: globalUniques.size };
  };

  const diagData = getUniqueOsCounts(auditTaller, 'DIAGNÓSTICO INICIAL COMPLETADO');
  const reacData = getUniqueOsCounts(auditTaller, 'REACONDICIONADO COMPLETADO');
  const repData = getUniqueOsCounts(auditTaller, 'REPARACIÓN COMPLETADA');
  const ccAproData = getUniqueOsCounts(
    auditTaller,
    'CONTROL DE CALIDAD COMPLETADO',
    true,
    false
  );
  const ccRechData = getUniqueOsCounts(
    auditTaller,
    'CONTROL DE CALIDAD COMPLETADO',
    false,
    true
  );

  const diagGoals = scalePeriodGoals(goalFor('diagnostico', 20), timeRange);
  const reacGoals = scalePeriodGoals(goalFor('reacondicionado', 20), timeRange);
  const repGoals = scalePeriodGoals(goalFor('reparacion', 15), timeRange);
  const ccGoals = scalePeriodGoals(goalFor('qc', 35), timeRange);

  const mapUserTable = (
    userMap: Record<string, Set<string>>,
    mapRow: (name: string, n: number) => Record<string, unknown>
  ) => {
    const rows = Object.keys(userMap)
      .map((name) => mapRow(name, userMap[name]?.size || 0))
      .filter((r) => Number(r.procesadas || r.reparadas || r.aprobadas || r.reacondicionadas || 0) > 0)
      .sort(
        (a, b) =>
          Number(b.procesadas || b.reparadas || b.aprobadas || b.reacondicionadas || 0) -
          Number(a.procesadas || a.reparadas || a.aprobadas || a.reacondicionadas || 0)
      );
    return rows;
  };

  const diagnosticoTable = mapUserTable(diagData.userMap, (tecnico, procesadas) => ({
    tecnico,
    procesadas,
    meta: diagGoals.meta,
    semana: diagGoals.semana,
    metaDiaria: diagGoals.diaria,
    pendientes: 0,
    estado: procesadas >= diagGoals.bonoThreshold ? 'Bono' : 'Ok',
  }));
  if (diagnosticoTable.length === 0) {
    diagnosticoTable.push({
      tecnico: 'Sin registros',
      procesadas: 0,
      meta: diagGoals.meta,
      semana: diagGoals.semana,
      metaDiaria: diagGoals.diaria,
      pendientes: 0,
      estado: 'Ok',
    });
  }

  const reacondicionadoTable = mapUserTable(reacData.userMap, (tecnico, n) => ({
    tecnico,
    reacondicionadas: n,
    procesadas: n,
    completadas: n,
    meta: reacGoals.meta,
    semana: reacGoals.semana,
    metaDiaria: reacGoals.diaria,
    tat: '—',
    estado: n >= reacGoals.bonoThreshold ? 'Bono' : 'Ok',
  }));

  const reparacionTable = mapUserTable(repData.userMap, (tecnico, reparadas) => ({
    tecnico,
    reparadas,
    meta: repGoals.meta,
    semana: repGoals.semana,
    metaDiaria: repGoals.diaria,
    enviadas: 0,
    estado: reparadas >= repGoals.bonoThreshold ? 'Bono' : 'Ok',
  }));
  if (reparacionTable.length === 0) {
    reparacionTable.push({
      tecnico: 'Sin registros',
      reparadas: 0,
      meta: repGoals.meta,
      semana: repGoals.semana,
      metaDiaria: repGoals.diaria,
      enviadas: 0,
      estado: 'Ok',
    });
  }

  const ccTable = Object.keys({
    ...ccAproData.userMap,
    ...ccRechData.userMap,
  })
    .map((inspector) => {
      const aprobadas = ccAproData.userMap[inspector]?.size || 0;
      const rechazadas = ccRechData.userMap[inspector]?.size || 0;
      return {
        inspector,
        aprobadas,
        meta: ccGoals.meta,
        semana: ccGoals.semana,
        metaDiaria: ccGoals.diaria,
        rechazadas,
        tecnicoRechazado: '—',
        estado: aprobadas >= ccGoals.bonoThreshold ? 'Bono' : 'Ok',
      };
    })
    .filter((u) => u.aprobadas > 0 || u.rechazadas > 0)
    .sort((a, b) => b.aprobadas - a.aprobadas);

  if (ccTable.length === 0) {
    ccTable.push({
      inspector: 'Sin registros',
      aprobadas: 0,
      meta: ccGoals.meta,
      semana: ccGoals.semana,
      metaDiaria: ccGoals.diaria,
      rechazadas: 0,
      tecnicoRechazado: '—',
      estado: 'Ok',
    });
  }

  const tallerTechStats: Record<
    string,
    { diagnostico: number; reacondicionado: number; reparacion: number; cc: number }
  > = {
    EQUIPO: {
      diagnostico: diagData.total,
      reacondicionado: reacData.total,
      reparacion: repData.total,
      cc: ccAproData.total + ccRechData.total,
    },
  };
  const tallerTechTable = Object.keys(tallerTechStats).map((t) => ({
    tecnologia: t,
    ...tallerTechStats[t],
  }));

  const tallerWip =
    wipInWorkshop + wipInQc + wipInValidation + wipControl + wipReady + wipIrreparable + wipScrapped;

  // Estado operativo: siempre OS.
  // Backoffice = pendientes ingreso bodega (NO `in_validation`: eso es QC Taller).
  const recepcionOsWip = await countDistinctOsByStatus(supabase, 'INGRESADO');
  const backofficeWipOs =
    (await countCacTrayOsWip(supabase)) ?? backofficePendientesIngreso;
  const estadoOperativo = {
    recepcion: recepcionOsWip,
    backoffice: backofficeWipOs,
    taller: tallerWip,
    bodega: bodegaInventarioCount,
    despacho: wipDispatched,
  };

  return {
    estadoOperativo,
    recepcion: {
      cajasRecibidasHoy,
      breakdown: {
        equipos: cajasEquipos,
        accesorios: cajasAccesorios,
        moviles: cajasMoviles,
      },
      totalUnidades,
      origenCac,
      origenPx,
      pendientesVerificar: 0,
      sinAsignarBodega: backofficePendientesIngreso,
      tables: {
        ingresos: ingresosTable,
        devoluciones: [],
        tecnologia: [],
      },
    },
    backoffice: {
      devolucionesPendientesRetornar: devolucionesPendientesTotal,
      sinIngresarBodega: backofficePendientesIngreso,
      registradasHoy: registradasHoyTotal,
      devolucionesPendientes: devolucionesPendientesTotal,
      /** Totales OS por canal (no cajas). */
      osViaPx: Object.values(backofficeCountsByUser).reduce((acc, d) => acc + d.px, 0),
      osViaCac: Object.values(backofficeCountsByUser).reduce((acc, d) => acc + d.cac, 0),
      tables: {
        registro: registroTable,
        devoluciones: devolucionesTable,
        totales: totalesTable,
        metas: totalesTable,
        tecnologia: backofficeTechTable,
      },
    },
    bodega: {
      ingresadasHoy: bodegaIngresosUnicos,
      ingresadasCac,
      ingresadasPx,
      /** Etiqueta de periodo fija para BOX recibidas (siempre mes). */
      boxesTimeLabel: 'Este Mes',
      pendientesIngreso: backofficePendientesIngreso,
      pendientesRecepcion: backofficeEnValidacion,
      traslados: trasladoOs.size,
      despachos: salidaOs.size,
      inventario: bodegaInventarioCount,
      tables: {
        ingresos: bodegaIngresosTable,
        pendientes: bodegaPendientesTable,
      },
    },
    taller: {
      pendientesDiagnostico: wipInWorkshop,
      pendientesCC: wipInQc,
      pendientesL3: wipControl,
      pendientesScraps: wipIrreparable + wipScrapped,
      diagnosticadas: diagData.total,
      reacondicionadas: reacData.total,
      reparadas: repData.total,
      aprobadasCC: ccAproData.total,
      rechazadasCC: ccRechData.total,
      tables: {
        diagnostico: diagnosticoTable,
        reacondicionado: reacondicionadoTable,
        reparacion: reparacionTable,
        cc: ccTable,
        tecnologia: tallerTechTable,
      },
    },
    salida: {
      listosDespacho: bodegaInventarioCount,
      despachadosHoy: salidaOs.size,
      tables: {
        despachos: [],
        pendientes: [],
      },
    },
  };
}
