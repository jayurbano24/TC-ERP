import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashboardMetrics, UserKPI, UserKpiBreakdown } from '@/lib/database/kpi';
import {
  countCacTrayOsInStatuses,
  countInventoryDetailOs,
} from './countDistinctOs';
import { fechasEnRango, resolveTimeRangeBounds } from './timeRange';

async function mapSeriesIdsToServiceOrders(
  supabase: SupabaseClient,
  seriesIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(seriesIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const { data } = await supabase.from('series').select('id, service_order_id').in('id', chunk);
    for (const row of data || []) {
      if (row.id && row.service_order_id) {
        map.set(String(row.id), String(row.service_order_id));
      }
    }
  }
  return map;
}

type ProfileKpiRow = {
  id: string;
  full_name?: string | null;
  is_active?: boolean | null;
  user_roles?: { role: string }[] | null;
  employees?: { nombre_completo?: string } | { nombre_completo?: string }[] | null;
};

function progressLabelForRole(role: string): string {
  const r = role.toUpperCase();
  if (r.includes('BACKOFFICE') || r.includes('GERENTE') || r === 'ADMIN' || r.includes('SUPERVISOR')) {
    return 'equipos / día';
  }
  if (r.includes('RECEPTOR') || r.includes('RECEPCION')) return 'equipos / día';
  if (r.includes('BODEGA')) return 'equipos / día';
  if (r.includes('TECNICO') || r.includes('TALLER') || r.includes('QC') || r.includes('OPERACION')) {
    return 'equipos / día';
  }
  if (r.includes('DESPACHO')) return 'equipos / día';
  return 'equipos / día';
}

function emptyBreakdown(): UserKpiBreakdown {
  return {
    diagnostico: 0,
    reparacion: 0,
    reacondicionado: 0,
    qc: 0,
    clasificados: 0,
    clasificadosPx: 0,
    bodega: 0,
  };
}

function stageKeyForAction(action: string): keyof UserKpiBreakdown | null {
  switch (action) {
    case 'DIAGNÓSTICO INICIAL COMPLETADO':
      return 'diagnostico';
    case 'REPARACIÓN COMPLETADA':
      return 'reparacion';
    case 'REACONDICIONADO COMPLETADO':
      return 'reacondicionado';
    case 'CONTROL DE CALIDAD COMPLETADO':
      return 'qc';
    case 'INGRESO BODEGA':
    case 'TRASLADO BODEGA':
    case 'TRASLADO':
    case 'TRASLADO MASIVO A TALLER':
    case 'DESPACHO CREADO':
      return 'bodega';
    default:
      return null;
  }
}

function roleBucket(role: string): 'backoffice' | 'reception' | 'bodega' | 'taller' | 'other' {
  const r = role.toUpperCase();
  if (r.includes('BACKOFFICE') || r.includes('GERENTE') || r === 'ADMIN' || r.includes('SUPERVISOR')) {
    return 'backoffice';
  }
  if (r.includes('RECEPTOR') || r.includes('RECEPCION')) return 'reception';
  if (r.includes('BODEGA')) return 'bodega';
  if (r.includes('TECNICO') || r.includes('TALLER') || r.includes('QC') || r.includes('OPERACION')) {
    return 'taller';
  }
  return 'other';
}

function resolveDisplayName(u: ProfileKpiRow): string {
  let realName = u.full_name || 'Usuario';
  const emp = u.employees;
  if (Array.isArray(emp) && emp[0]?.nombre_completo) realName = emp[0].nombre_completo;
  else if (emp && !Array.isArray(emp) && emp.nombre_completo) realName = emp.nombre_completo;
  else if (realName.includes('@')) realName = realName.split('@')[0];
  return realName;
}

function normalizeNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function namesLikelyMatch(a: string, b: string): boolean {
  const ta = normalizeNameTokens(a);
  const tb = normalizeNameTokens(b);
  if (!ta.length || !tb.length) return false;
  if (ta.join(' ') === tb.join(' ')) return true;
  const setB = new Set(tb);
  let overlap = 0;
  for (const token of ta) {
    if (setB.has(token)) overlap += 1;
  }
  return overlap >= 2;
}

function buildNameResolver(users: ProfileKpiRow[]) {
  const idByKey = new Map<string, string>();
  const aliasEntries: { id: string; keys: string[] }[] = [];
  for (const u of users) {
    const keys = new Set<string>();
    if (u.full_name) keys.add(u.full_name.trim());
    const emp = u.employees;
    if (Array.isArray(emp) && emp[0]?.nombre_completo) keys.add(emp[0].nombre_completo.trim());
    else if (emp && !Array.isArray(emp) && emp.nombre_completo) keys.add(emp.nombre_completo.trim());
    idByKey.set(u.id.toLowerCase(), u.id);
    const keyList: string[] = [];
    for (const key of keys) {
      const lower = key.toLowerCase();
      idByKey.set(lower, u.id);
      keyList.push(key);
      if (lower.includes('@')) {
        idByKey.set(lower.split('@')[0], u.id);
        keyList.push(lower.split('@')[0]);
      }
    }
    aliasEntries.push({ id: u.id, keys: keyList });
  }
  return (actorKey: string | null | undefined): string | null => {
    if (!actorKey) return null;
    const trimmed = actorKey.trim();
    const lower = trimmed.toLowerCase();
    if (idByKey.has(lower)) return idByKey.get(lower)!;
    if (lower.includes('@')) {
      const local = lower.split('@')[0];
      if (idByKey.has(local)) return idByKey.get(local)!;
    }
    for (const entry of aliasEntries) {
      if (entry.keys.some((key) => namesLikelyMatch(trimmed, key))) return entry.id;
    }
    return null;
  };
}

export type WorkshopOsByStage = {
  diagnostico: number;
  reparacion: number;
  reacondicionado: number;
  qc: number;
  l3: number;
  scraps: number;
  listo: number;
};

export type PipelineSnapshot = {
  recepcion: number;
  backoffice: number;
  taller: number;
  bodega: number;
  despacho: number;
  workshopOs: WorkshopOsByStage;
  refreshedAt: string | null;
};

function readWorkshopOsFromMap(map: Record<string, number>): WorkshopOsByStage {
  return {
    diagnostico: map.os_diagnostico ?? 0,
    reparacion: map.os_reparacion ?? 0,
    reacondicionado: map.os_reacondicionado ?? 0,
    qc: map.os_qc ?? 0,
    l3: map.os_l3 ?? 0,
    scraps: map.os_scraps ?? 0,
    listo: map.os_listo ?? 0,
  };
}

function readTechNameFromSeriesRow(row: {
  models?: { technologies?: { name?: string } | null } | { technologies?: { name?: string } | null }[] | null;
}): string {
  const models = row.models;
  const model = Array.isArray(models) ? models[0] : models;
  const raw = model?.technologies?.name;
  if (!raw) return 'GENERICO';
  return raw.trim().toUpperCase() || 'GENERICO';
}

/** Equipos procesados en el rango, agrupados por tecnología (models → technologies). */
export async function readProductionByTechnology(
  supabase: SupabaseClient,
  timeRange: string
): Promise<{ name: string; count: number }[]> {
  const { startIso, endIso } = resolveTimeRangeBounds(timeRange);

  const { data: series, error } = await supabase
    .from('series')
    .select('id, models(technologies(name))')
    .gte('updated_at', startIso)
    .lte('updated_at', endIso);

  if (error || !series?.length) return [];

  const counts: Record<string, number> = {};
  for (const row of series) {
    const tech = readTechNameFromSeriesRow(row as Parameters<typeof readTechNameFromSeriesRow>[0]);
    counts[tech] = (counts[tech] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export async function readDashboardMetricsFromKpi(
  supabase: SupabaseClient,
  timeRange: string
): Promise<DashboardMetrics | null> {
  const fechas = fechasEnRango(timeRange);
  if (fechas.length === 0) return null;

  const { data: diario, error } = await supabase
    .from('kpi_diario')
    .select('fecha, proceso, metrica, valor')
    .in('fecha', fechas);

  if (error) return null;

  const productionMetrics = new Set([
    'diagnosticos_completados',
    'reparaciones_completadas',
    'reacondicionados_completados',
    'qc_completados',
  ]);

  let totalProduction = 0;
  let qcTotal = 0;
  let qcFailed = 0;

  for (const row of diario) {
    const val = Number(row.valor ?? 0);
    if (row.proceso === 'taller' && productionMetrics.has(row.metrica)) {
      totalProduction += val;
    }
    if (row.metrica === 'qc_completados') qcTotal += val;
    if (row.metrica === 'qc_rechazados') qcFailed += val;
  }

  const { data: usuarios } = await supabase
    .from('kpi_usuario')
    .select('user_id, valor')
    .in('fecha', fechas)
    .gt('valor', 0);

  const activeTechnicians = new Set((usuarios ?? []).map((u) => u.user_id)).size;

  const errorRate = qcTotal > 0 ? parseFloat(((qcFailed / qcTotal) * 100).toFixed(1)) : 0;

  const productionByBrand = await readProductionByTechnology(supabase, timeRange);

  return {
    totalProduction,
    activeTechnicians,
    errorRate,
    productionByBrand,
  };
}

export async function readPipelineFromKpi(supabase: SupabaseClient): Promise<PipelineSnapshot | null> {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  // Lectura rápida desde proyección (el sync escribe OS; Bodega = Detalle Inventario).
  // No pagear series aquí: provoca input delay / renders largos en el dashboard.
  const { data, error } = await supabase
    .from('kpi_proceso')
    .select('metrica, valor, refreshed_at')
    .eq('fecha', today);

  if (error || !data?.length) return null;

  const map = Object.fromEntries(data.map((r) => [r.metrica, Number(r.valor ?? 0)]));
  const refreshedAt = data.reduce<string | null>((max, r) => {
    if (!r.refreshed_at) return max;
    if (!max || r.refreshed_at > max) return r.refreshed_at;
    return max;
  }, null);

  // Bodega + Backoffice en vivo (OS). Evita wip_* stale/inflado en kpi_proceso.
  let bodegaOs = map.wip_bodega ?? 0;
  let backofficeOs = map.wip_backoffice ?? 0;
  try {
    const [bodegaLive, backofficeLive] = await Promise.all([
      countInventoryDetailOs(supabase),
      countCacTrayOsInStatuses(supabase, ['RECEPCIONADO_BODEGA_GENERAL']),
    ]);
    bodegaOs = bodegaLive;
    backofficeOs = backofficeLive;
  } catch {
    /* conservar proyección */
  }

  return {
    recepcion: map.wip_recepcion ?? 0,
    backoffice: backofficeOs,
    taller: map.wip_taller ?? 0,
    bodega: bodegaOs,
    despacho: map.wip_despacho ?? 0,
    workshopOs: readWorkshopOsFromMap(map),
    refreshedAt,
  };
}

const TALLER_AUDIT_ACTIONS = [
  'DIAGNÓSTICO INICIAL COMPLETADO',
  'REPARACIÓN COMPLETADA',
  'REACONDICIONADO COMPLETADO',
  'CONTROL DE CALIDAD COMPLETADO',
] as const;

const BODEGA_AUDIT_ACTIONS = [
  'INGRESO BODEGA',
  'TRASLADO BODEGA',
  'TRASLADO',
  'TRASLADO MASIVO A TALLER',
  'DESPACHO CREADO',
] as const;

/**
 * Producción / Rendimiento por persona.
 * Misma regla que pestaña KPI Taller: 1 equipo = 1 OS distinto
 * (erp_audit_logs.record_id = series.id → service_order_id).
 * Backoffice: OS distintos en `cac_tray_units`.
 */
export async function readDailyUserProductionKpis(
  supabase: SupabaseClient,
  timeRange: string
): Promise<UserKPI[]> {
  const { startIso, endIso } = resolveTimeRangeBounds(timeRange);

  const { data: usersData } = await supabase
    .from('profiles')
    .select('id, full_name, is_active, user_roles(role), employees(nombre_completo)');

  if (!usersData?.length) return [];

  const users = usersData as ProfileKpiRow[];
  const resolveUserId = buildNameResolver(users);

  let targetsData: Array<{ user_id: string; target_value: number }> = [];
  try {
    const res = await supabase.from('user_kpi_targets').select('user_id, target_value');
    if (res.data) targetsData = res.data as Array<{ user_id: string; target_value: number }>;
  } catch {
    /* tabla opcional */
  }

  type AuditRow = { user_id?: string | null; action?: string | null; record_id?: string | null };
  const auditRows: AuditRow[] = [];
  const PAGE = 1000;
  let offset = 0;
  const actions = [...TALLER_AUDIT_ACTIONS, ...BODEGA_AUDIT_ACTIONS];
  for (;;) {
    const { data: page, error } = await supabase
      .from('erp_audit_logs')
      .select('user_id, action, record_id')
      .in('action', actions)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .range(offset, offset + PAGE - 1);

    if (error) break;
    const rows = (page ?? []) as AuditRow[];
    auditRows.push(...rows);
    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  const tallerActions = new Set<string>(TALLER_AUDIT_ACTIONS);
  const moveActions = new Set<string>(BODEGA_AUDIT_ACTIONS);

  const seriesIds = auditRows
    .filter((r) => r.record_id && tallerActions.has(String(r.action || '')))
    .map((r) => String(r.record_id));
  const seriesToOs = await mapSeriesIdsToServiceOrders(supabase, seriesIds);

  // Equipos/día = OS distintos por etapa (misma regla que pestaña KPI Taller).
  const stageOsByUser = new Map<string, Map<keyof UserKpiBreakdown, Set<string>>>();
  const touchOsByUser = new Map<string, Set<string>>();

  const bumpStage = (uid: string, stage: keyof UserKpiBreakdown, key: string) => {
    let stages = stageOsByUser.get(uid);
    if (!stages) {
      stages = new Map();
      stageOsByUser.set(uid, stages);
    }
    let set = stages.get(stage);
    if (!set) {
      set = new Set<string>();
      stages.set(stage, set);
    }
    set.add(key);
    const isTaller =
      stage === 'diagnostico' ||
      stage === 'reparacion' ||
      stage === 'reacondicionado' ||
      stage === 'qc';
    if (isTaller) {
      let touch = touchOsByUser.get(uid);
      if (!touch) {
        touch = new Set<string>();
        touchOsByUser.set(uid, touch);
      }
      touch.add(key);
    }
  };

  for (const row of auditRows) {
    const uid = String(row.user_id || '');
    const action = String(row.action || '');
    const recordId = row.record_id ? String(row.record_id) : '';
    if (!uid) continue;
    const stage = stageKeyForAction(action);
    if (!stage) continue;

    if (tallerActions.has(action)) {
      const osId = (recordId && seriesToOs.get(recordId)) || recordId;
      if (!osId) continue;
      bumpStage(uid, stage, osId);
      continue;
    }

    if (moveActions.has(action)) {
      const key = recordId || `${action}:${uid}`;
      bumpStage(uid, 'bodega', key);
    }
  }

  // Backoffice CAC — OS en bandeja (misma fuente que pestaña KPI Backoffice)
  const trayOsIds = new Set<string>();
  const cacTrayUserIds = new Set<string>();
  const { data: trayUnits } = await supabase
    .from('cac_tray_units')
    .select('received_by_name, service_order_id')
    .gte('classified_at', startIso)
    .lte('classified_at', endIso);

  (trayUnits || []).forEach(
    (row: { received_by_name?: string; service_order_id?: string }, idx: number) => {
      const userId = resolveUserId(row.received_by_name);
      if (row.service_order_id) trayOsIds.add(row.service_order_id.trim());
      if (!userId) return;
      cacTrayUserIds.add(userId);
      const osKey = row.service_order_id?.trim() || `__anon_${userId}_${idx}`;
      bumpStage(userId, 'clasificados', osKey);
    }
  );

  // Backoffice PX — OS de recepciones source=px (Steven, etc.; no están en bandeja CAC)
  const { data: pxReceptions } = await supabase
    .from('receptions')
    .select('id, received_by, notes, received_units')
    .eq('source', 'px')
    .gte('created_at', startIso)
    .lte('created_at', endIso)
    .not('status', 'in', '(ELIMINADO,ELIMINADO POR BODEGA)');

  const pxOperatorByReception = new Map<string, string | null>();
  for (const r of pxReceptions || []) {
    const fromId = resolveUserId(r.received_by);
    const fromNotes = r.notes?.match(/Recibido Por:\s*([^\n]+)/i)?.[1]?.trim();
    const uid = fromId || resolveUserId(fromNotes);
    pxOperatorByReception.set(String(r.id), uid);
  }

  const pxReceptionIds = [...pxOperatorByReception.keys()];
  for (let i = 0; i < pxReceptionIds.length; i += 200) {
    const chunk = pxReceptionIds.slice(i, i + 200);
    const { data: pxOrders } = await supabase
      .from('service_orders')
      .select('id, reception_id')
      .in('reception_id', chunk)
      .gte('created_at', startIso)
      .lte('created_at', endIso);

    for (const os of pxOrders || []) {
      if (!os.id || trayOsIds.has(String(os.id))) continue;
      let uid = os.reception_id ? pxOperatorByReception.get(String(os.reception_id)) : null;
      if (uid && cacTrayUserIds.has(uid)) uid = null;
      if (!uid) continue;
      bumpStage(uid, 'clasificadosPx', String(os.id));
    }
  }

  // Bodega — cajas distintas con movimiento INGRESO en el periodo (Joshay, etc.)
  const { data: bodegaIngresos } = await supabase
    .from('warehouse_movements')
    .select('box_id, performed_by, performed_by_name')
    .eq('movement_type', 'INGRESO')
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  for (const m of bodegaIngresos || []) {
    if (!m.box_id) continue;
    const uid =
      resolveUserId(m.performed_by) ||
      resolveUserId(m.performed_by_name) ||
      null;
    if (!uid) continue;
    bumpStage(uid, 'bodega', String(m.box_id));
  }

  const breakdownFor = (uid: string): UserKpiBreakdown => {
    const b = emptyBreakdown();
    const stages = stageOsByUser.get(uid);
    if (!stages) return b;
    for (const [stage, set] of stages) {
      b[stage] = set.size;
    }
    return b;
  };

  const kpis: UserKPI[] = users
    .filter((u) => u.is_active && u.user_roles && u.user_roles.length > 0)
    .map((u) => {
      const roleStr = u.user_roles![0].role;
      const breakdown = breakdownFor(u.id);
      const tallerTouch = touchOsByUser.get(u.id)?.size ?? 0;
      const backofficeOs = breakdown.clasificados + breakdown.clasificadosPx;
      const bodegaBoxes = breakdown.bodega;

      // Equipos/día: taller OS | backoffice OS (CAC+PX) | cajas bodega — el mayor canal.
      const progress = Math.max(tallerTouch, backofficeOs, bodegaBoxes);

      const targetObj = targetsData.find((t) => t.user_id === u.id);
      const target = targetObj ? Number(targetObj.target_value) : 100;

      return {
        user_id: u.id,
        name: resolveDisplayName(u),
        role: roleStr,
        target,
        progress,
        percentage: target > 0 ? Math.round((progress / target) * 100) : 0,
        progressLabel: progressLabelForRole(roleStr),
        breakdown,
      };
    });

  return kpis.sort((a, b) => b.progress - a.progress || b.percentage - a.percentage);
}

export async function kpiProjectionsAvailable(supabase: SupabaseClient): Promise<boolean> {
  const { count, error } = await supabase
    .from('kpi_diario')
    .select('fecha', { count: 'exact', head: true })
    .limit(1);
  return !error && (count ?? 0) > 0;
}
