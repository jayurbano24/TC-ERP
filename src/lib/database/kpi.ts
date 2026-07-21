import { COUNT_HEAD } from '@/shared/constants/dbProjections';
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type UserKPI = {
  user_id: string;
  name: string;
  role: string;
  target: number;
  progress: number;
  percentage: number;
  /** Unidad legible del trabajo contado (ej. equipos clasificados). */
  progressLabel: string;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  is_active?: boolean | null;
  user_roles?: { role: string }[];
  employees?: { nombre_completo?: string } | { nombre_completo?: string }[] | null;
};

function getTimeRangeBounds(timeRange: string): { startIso: string; endIso: string } {
  const startOfRange = new Date();
  const endOfRange = new Date();

  if (timeRange === 'Ayer') {
    startOfRange.setDate(startOfRange.getDate() - 1);
    startOfRange.setHours(0, 0, 0, 0);
    endOfRange.setDate(endOfRange.getDate() - 1);
    endOfRange.setHours(23, 59, 59, 999);
  } else if (timeRange === 'Esta Semana') {
    const day = startOfRange.getDay();
    const diff = startOfRange.getDate() - day + (day === 0 ? -6 : 1);
    startOfRange.setDate(diff);
    startOfRange.setHours(0, 0, 0, 0);
    endOfRange.setHours(23, 59, 59, 999);
  } else if (timeRange === 'Este Mes') {
    startOfRange.setDate(1);
    startOfRange.setHours(0, 0, 0, 0);
    endOfRange.setHours(23, 59, 59, 999);
  } else {
    startOfRange.setHours(0, 0, 0, 0);
    endOfRange.setHours(23, 59, 59, 999);
  }

  return { startIso: startOfRange.toISOString(), endIso: endOfRange.toISOString() };
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

  // Exige ≥2 tokens en común. Con 1 token (p. ej. un apellido corto) el match
  // era demasiado laxo y podía atribuir el mismo lote a varias personas.
  const setB = new Set(tb);
  let overlap = 0;
  for (const token of ta) {
    if (setB.has(token)) overlap += 1;
  }
  return overlap >= 2;
}

function buildUserIdResolver(usersData: ProfileRow[]) {
  const idByKey = new Map<string, string>();
  const aliasEntries: { id: string; keys: string[] }[] = [];

  for (const userRow of usersData) {
    const keys = new Set<string>();
    if (userRow.full_name) keys.add(userRow.full_name.trim());
    const emp = userRow.employees;
    if (Array.isArray(emp) && emp[0]?.nombre_completo) keys.add(emp[0].nombre_completo.trim());
    else if (emp && !Array.isArray(emp) && emp.nombre_completo) keys.add(emp.nombre_completo.trim());

    idByKey.set(userRow.id.toLowerCase(), userRow.id);
    const keyList: string[] = [];
    for (const key of keys) {
      const lower = key.toLowerCase();
      idByKey.set(lower, userRow.id);
      keyList.push(key);
      if (lower.includes('@')) {
        idByKey.set(lower.split('@')[0], userRow.id);
        keyList.push(lower.split('@')[0]);
      }
    }
    aliasEntries.push({ id: userRow.id, keys: keyList });
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
      if (entry.keys.some((key) => namesLikelyMatch(trimmed, key))) {
        return entry.id;
      }
    }
    return null;
  };
}

function progressLabelForRole(role: string): string {
  const r = role.toUpperCase();
  if (r.includes('BACKOFFICE') || r.includes('GERENTE') || r === 'ADMIN' || r.includes('SUPERVISOR')) {
    return 'equipos (OS) clasificados';
  }
  if (r.includes('RECEPTOR') || r.includes('RECEPCION')) return 'unidades recibidas';
  if (r.includes('BODEGA')) return 'movimientos de bodega';
  if (r.includes('TECNICO') || r.includes('TALLER') || r.includes('QC') || r.includes('OPERACION')) {
    return 'órdenes de taller';
  }
  return 'unidades procesadas';
}

function roleCountsBackoffice(role: string): boolean {
  const r = role.toUpperCase();
  return (
    r.includes('BACKOFFICE') ||
    r.includes('GERENTE') ||
    r === 'ADMIN' ||
    r.includes('SUPERVISOR')
  );
}

function roleCountsReception(role: string): boolean {
  const r = role.toUpperCase();
  return r.includes('RECEPTOR') || r.includes('RECEPCION');
}

function roleCountsBodega(role: string): boolean {
  return role.toUpperCase().includes('BODEGA');
}

function roleCountsTaller(role: string): boolean {
  const r = role.toUpperCase();
  return r.includes('TECNICO') || r.includes('TALLER') || r.includes('QC') || r.includes('OPERACION');
}

export async function getDailyKPIs(timeRange: string = 'Hoy'): Promise<UserKPI[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  // Obtener usuarios activos y roles y empleados
  const { data: usersData } = await supabase
    .from('profiles')
    .select('id, full_name, is_active, user_roles(role), employees(nombre_completo)');

  if (!usersData) return [];

  // Obtener metas
  let targetsData: any[] = [];
  try {
    const res = await supabase.from('user_kpi_targets').select('user_id, target_value');
    if (res.data) targetsData = res.data;
  } catch (e) {
    console.warn('user_kpi_targets table might not exist yet.');
  }

  const { startIso, endIso } = getTimeRangeBounds(timeRange);
  const resolveUserId = buildUserIdResolver(usersData as ProfileRow[]);

  const [
    { data: receptions },
    { data: movements },
    { data: jobs },
    { data: classifiedGuides },
    { data: trayUnits },
    { data: auditLogs },
  ] = await Promise.all([
    supabase
      .from('receptions')
      .select('received_by, received_units, notes')
      .gte('created_at', startIso)
      .lte('created_at', endIso),
    supabase
      .from('inventory_movements')
      .select('moved_by, id')
      .gte('moved_at', startIso)
      .lte('moved_at', endIso),
    supabase
      .from('workshop_jobs')
      .select('technician_id, id')
      .gte('created_at', startIso)
      .lte('created_at', endIso),
    supabase
      .from('reception_guides')
      .select('classified_by, category')
      .gte('classified_at', startIso)
      .lte('classified_at', endIso)
      .not('classified_by', 'is', null),
    supabase
      .from('cac_tray_units')
      .select('received_by_name, service_order_id')
      .gte('classified_at', startIso)
      .lte('classified_at', endIso),
    supabase
      .from('erp_audit_logs')
      .select('user_id, action, new_values')
      .eq('module', 'cac_backoffice')
      .in('action', ['CLASSIFY_BATCH', 'GUIDE_COMPLETED', 'RECEPTION_CLASSIFIED', 'SERIES_CLASSIFIED'])
      .gte('created_at', startIso)
      .lte('created_at', endIso),
  ]);

  const progressBySource: Record<string, { reception: number; backoffice: number; bodega: number; taller: number }> = {};

  const bump = (userId: string | null, source: 'reception' | 'backoffice' | 'bodega' | 'taller', amount: number) => {
    if (!userId || amount <= 0) return;
    if (!progressBySource[userId]) {
      progressBySource[userId] = { reception: 0, backoffice: 0, bodega: 0, taller: 0 };
    }
    progressBySource[userId][source] += amount;
  };

  receptions?.forEach((r: { received_by?: string; received_units?: number; notes?: string }) => {
    const fromNotes = r.notes?.match(/Recibido Por:\s*([^\n]+)/i)?.[1]?.trim();
    const actorId = resolveUserId(r.received_by) || resolveUserId(fromNotes);
    bump(actorId, 'reception', r.received_units || 1);
  });

  movements?.forEach((m: { moved_by?: string }) => {
    bump(resolveUserId(m.moved_by) || m.moved_by || null, 'bodega', 1);
  });

  jobs?.forEach((j: { technician_id?: string }) => {
    if (j.technician_id) bump(j.technician_id, 'taller', 1);
  });

  /**
   * Backoffice — fuente de verdad = OS distintos en bandeja CAC (`cac_tray_units`),
   * alineado con kpi-engine. Antes se sumaban guías + bandeja + CLASSIFY_BATCH.units_count
   * y varias personas podían heredar el mismo total del lote (p. ej. 244/244).
   */
  const trayOsByUser = new Map<string, Set<string>>();
  trayUnits?.forEach((row: { received_by_name?: string; service_order_id?: string }, idx: number) => {
    const userId = resolveUserId(row.received_by_name);
    if (!userId) return;
    let osSet = trayOsByUser.get(userId);
    if (!osSet) {
      osSet = new Set<string>();
      trayOsByUser.set(userId, osSet);
    }
    const osKey = row.service_order_id?.trim() || `__anon_${userId}_${idx}`;
    osSet.add(osKey);
  });
  for (const [userId, osSet] of trayOsByUser) {
    bump(userId, 'backoffice', osSet.size);
  }
  const usersWithTrayCredit = new Set(trayOsByUser.keys());

  // Guías: solo clasificadores sin filas en bandeja (evita doble conteo del mismo trabajo).
  classifiedGuides?.forEach((g: { classified_by?: string }) => {
    const userId = resolveUserId(g.classified_by);
    if (!userId || usersWithTrayCredit.has(userId)) return;
    bump(userId, 'backoffice', 1);
  });

  // Audit: fallback 1 evento; NUNCA sumar units_count del lote (duplicaba totales del equipo).
  auditLogs?.forEach((log: { user_id?: string; action?: string; new_values?: Record<string, unknown> }) => {
    const payload = log.new_values || {};
    const registeredBy =
      typeof payload.registered_by === 'string'
        ? payload.registered_by
        : typeof payload.classified_by === 'string'
          ? payload.classified_by
          : null;

    const userId = log.user_id || resolveUserId(registeredBy);
    if (!userId || usersWithTrayCredit.has(userId)) return;
    if (log.action === 'SERIES_CLASSIFIED') return;
    bump(userId, 'backoffice', 1);
  });

  const kpis: UserKPI[] = usersData
    .filter((u) => u.is_active && u.user_roles && u.user_roles.length > 0)
    .map((userRow) => {
      const u = userRow as ProfileRow;
      const roleStr = u.user_roles![0].role;
      const sources = progressBySource[u.id] || { reception: 0, backoffice: 0, bodega: 0, taller: 0 };

      let progress = 0;
      if (roleCountsBackoffice(roleStr)) progress = sources.backoffice;
      else if (roleCountsReception(roleStr)) progress = sources.reception;
      else if (roleCountsBodega(roleStr)) progress = sources.bodega;
      else if (roleCountsTaller(roleStr)) progress = sources.taller;
      else {
        progress =
          sources.backoffice + sources.reception + sources.bodega + sources.taller;
      }

      const targetObj = targetsData.find((t) => t.user_id === u.id);

      let realName = u.full_name || 'Usuario';
      const emp = u.employees;
      if (Array.isArray(emp) && emp[0]?.nombre_completo) {
        realName = emp[0].nombre_completo;
      } else if (emp && !Array.isArray(emp) && emp.nombre_completo) {
        realName = emp.nombre_completo;
      } else if (realName.includes('@')) {
        realName = realName.split('@')[0];
      }

      const target = targetObj ? targetObj.target_value : 100;

      return {
        user_id: u.id,
        name: realName,
        role: roleStr,
        target,
        progress,
        percentage: target > 0 ? Math.round((progress / target) * 100) : 0,
        progressLabel: progressLabelForRole(roleStr),
      };
    });

  return kpis.sort((a, b) => b.progress - a.progress || b.percentage - a.percentage);
}

export async function setKPI(userId: string, targetValue: number) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return false;

  const { error } = await supabase
    .from('user_kpi_targets')
    .upsert({ user_id: userId, target_value: targetValue }, { onConflict: 'user_id' });

  return !error;
}

export type DashboardMetrics = {
  totalProduction: number;
  activeTechnicians: number;
  errorRate: number;
  productionByBrand: { name: string; count: number }[];
};

export async function getDashboardMetrics(timeRange: string = 'Hoy'): Promise<DashboardMetrics> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { totalProduction: 0, activeTechnicians: 0, errorRate: 0, productionByBrand: [] };

  const startOfRange = new Date();
  if (timeRange === 'Ayer') {
    startOfRange.setDate(startOfRange.getDate() - 1);
    startOfRange.setHours(0, 0, 0, 0);
  } else if (timeRange === 'Esta Semana') {
    const day = startOfRange.getDay();
    const diff = startOfRange.getDate() - day + (day === 0 ? -6 : 1);
    startOfRange.setDate(diff);
    startOfRange.setHours(0, 0, 0, 0);
  } else if (timeRange === 'Este Mes') {
    startOfRange.setDate(1);
    startOfRange.setHours(0, 0, 0, 0);
  } else {
    startOfRange.setHours(0, 0, 0, 0);
  }
  const endOfRange = new Date();
  if (timeRange === 'Ayer') {
    endOfRange.setDate(endOfRange.getDate() - 1);
    endOfRange.setHours(23, 59, 59, 999);
  } else {
    endOfRange.setHours(23, 59, 59, 999);
  }
  const startIso = startOfRange.toISOString();
  const endIso = endOfRange.toISOString();

  // Total Production & Active Technicians
  const { data: jobs } = await supabase
    .from('workshop_jobs')
    .select('id, technician_id')
    .gte('created_at', startIso);

  let totalProduction = 0;
  let activeTechnicians = 0;

  if (jobs) {
    totalProduction = jobs.length;
    const uniqueTechs = new Set(jobs.map((j: any) => j.technician_id).filter(Boolean));
    activeTechnicians = uniqueTechs.size;
  }

  // Devoluciones / Errores
  const { data: qc } = await supabase
    .from('qc_checks')
    .select('passed')
    .gte('created_at', startIso);

  let errorRate = 0;
  if (qc && qc.length > 0) {
    const failed = qc.filter((q: any) => q.passed === false).length;
    errorRate = (failed / qc.length) * 100;
  }

  // Producción por tecnología (series movidas en el rango)
  const { data: series } = await supabase
    .from('series')
    .select('id, models(technologies(name))')
    .gte('updated_at', startIso)
    .lte('updated_at', endIso);

  const techCounts: Record<string, number> = {};
  if (series) {
    series.forEach((s: any) => {
      const model = Array.isArray(s.models) ? s.models[0] : s.models;
      const techName = (model?.technologies?.name || 'GENERICO').trim().toUpperCase();
      techCounts[techName] = (techCounts[techName] || 0) + 1;
    });
  }

  const productionByBrand = Object.entries(techCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5); // Top 5

  return {
    totalProduction,
    activeTechnicians,
    errorRate: parseFloat(errorRate.toFixed(1)),
    productionByBrand
  };
}

export type AreaKPI = {
  id: string;
  name: string;
  mainMetric: string;
  mainValue: number;
  subMetric1: string;
  subValue1: number | string;
  subMetric2: string;
  subValue2: number | string;
  status: 'good' | 'warning' | 'critical';
  users?: { name: string, count: number, target: number }[];
};

export async function getAreaKPIs(): Promise<AreaKPI[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const startIso = startOfDay.toISOString();
  const endIso = endOfDay.toISOString();

  // Fetch users and roles to assign to areas
  const { data: usersData } = await supabase
    .from('profiles')
    .select('id, full_name, user_roles(role), employees(nombre_completo)')
    .eq('is_active', true);

  let targetsData: any[] = [];
  try {
    const res = await supabase.from('user_kpi_targets').select('user_id, target_value');
    if (res.data) targetsData = res.data;
  } catch (e) {
    // ignore
  }

  const getUserName = (id: string) => {
    const userRow = usersData?.find(u => u.id === id);
    if (!userRow) return 'Desconocido';
    const u = userRow as any;
    let realName = u.full_name || 'Desconocido';
    if (u.employees && Array.isArray(u.employees) && u.employees.length > 0 && u.employees[0].nombre_completo) {
      realName = u.employees[0].nombre_completo;
    } else if (u.employees && !Array.isArray(u.employees) && u.employees.nombre_completo) {
      realName = u.employees.nombre_completo;
    } else if (realName.includes('@')) {
      realName = realName.split('@')[0];
    }
    return realName;
  };
  const getUserTarget = (id: string) => targetsData.find(t => t.user_id === id)?.target_value || 0;
  const getUserIdByName = (name: string) => {
    // Attempt reverse lookup (rough approximation since names are now transformed)
    const u = usersData?.find(u => getUserName(u.id) === name);
    return u?.id;
  };

  const getNamesByRoles = (roles: string[]) => {
    return usersData
      ?.filter(u => u.user_roles?.some((ur: any) => roles.includes(ur.role)))
      .map(u => ({ name: getUserName(u.id), count: 0, target: getUserTarget(u.id) })) || [];
  };

  const mergeUsers = (counts: Record<string, number>, roles: string[]) => {
    const baseUsers = getNamesByRoles(roles);
    Object.entries(counts).forEach(([name, count]) => {
      const existing = baseUsers.find(u => u.name === name);
      if (existing) {
        existing.count += count;
      } else {
        baseUsers.push({ name, count, target: getUserTarget(getUserIdByName(name) || '') });
      }
    });
    return baseUsers;
  };

  // 1. Recepción General
  const { data: receptions } = await supabase.from('receptions').select('id, received_units, received_by').gte('created_at', startIso).lte('created_at', endIso);
  const recepcionUnits = receptions?.reduce((acc: number, r: any) => acc + (r.received_units || 0), 0) || 0;
  const recepcionBoxes = receptions?.length || 0;
  
  const recUserCounts: Record<string, number> = {};
  receptions?.forEach((r: any) => {
    if (r.received_by) {
      const name = getUserName(r.received_by);
      recUserCounts[name] = (recUserCounts[name] || 0) + (r.received_units || 0);
    }
  });
  const recepcionUsers = mergeUsers(recUserCounts, ['receptor_cac', 'receptor_px', 'RECEPCION']);

  // 2. Devoluciones
  const { count: devolucionesCount } = await supabase.from('series').select('id', { count: 'exact', head: true }).eq('current_status', 'returned').gte('updated_at', startIso).lte('updated_at', endIso);
  const devolucionesUsers = getNamesByRoles(['qc', 'supervisor', 'DEVOLUCIONES', 'OPERACION STB']); 
  
  // 3. Backoffice
  const { count: backofficeCount } = await supabase.from('series').select('id', { count: 'exact', head: true }).eq('current_status', 'in_validation').gte('updated_at', startIso).lte('updated_at', endIso);
  const backofficeUsers = mergeUsers({}, ['admin', 'supervisor', 'gerencia', 'BACKOFFICES', 'BACKOFFICES-LBT', 'GERENTE GENERAL']); 

  // 4. Taller
  const { data: jobs } = await supabase.from('workshop_jobs').select('id, technician_id').gte('created_at', startIso).lte('created_at', endIso);
  const tallerCount = jobs?.length || 0;
  const wsUserCounts: Record<string, number> = {};
  jobs?.forEach((j: any) => {
    if (j.technician_id) {
      const name = getUserName(j.technician_id);
      wsUserCounts[name] = (wsUserCounts[name] || 0) + 1;
    }
  });
  const tallerUsers = mergeUsers(wsUserCounts, ['tecnico', 'qc', 'OPERACION STB', 'SUPERVISOR STB']);

  // 5. Bodega
  const { count: bodegaCount } = await supabase.from('series').select('id', { count: 'exact', head: true }).in('current_status', ['in_central_warehouse', 'in_control_warehouse']).gte('updated_at', startIso).lte('updated_at', endIso);
  const bodegaUsers = mergeUsers({}, ['bodega', 'BODEGA RFB']);

  // 6. Despacho
  const { data: dispatches } = await supabase.from('dispatches').select('id, dispatched_by').gte('created_at', startIso).lte('created_at', endIso);
  const despachoCount = dispatches?.length || 0;
  const dispUserCounts: Record<string, number> = {};
  dispatches?.forEach((d: any) => {
    if (d.dispatched_by) {
      const name = getUserName(d.dispatched_by);
      dispUserCounts[name] = (dispUserCounts[name] || 0) + 1;
    }
  });
  const despachoUsers = mergeUsers(dispUserCounts, ['bodega', 'supervisor', 'BODEGA RFB']);

  // 7. Equipo Listo
  const { data: listoJobs } = await supabase.from('workshop_jobs')
    .select('id, technician_id')
    .in('result', ['reacondicionado', 'reparado', 'listo'])
    .gte('created_at', startIso).lte('created_at', endIso);
  const equipoListoCount = listoJobs?.length || 0;

  // Fetch current queues for all workshop stages
  const { data: currentSeriesStatus } = await supabase.from('series').select('current_status').in('current_status', [
    'in_workshop', 'in_qc', 'ready_to_dispatch', 'in_validation', 'in_control_warehouse', 'irreparable', 'scrapped', 'in_central_warehouse'
  ]);
  
  let diagQueue = 0, repQueue = 0, reacQueue = 0, qcQueue = 0, l3Queue = 0, scrapQueue = 0, listoQueue = 0;
  if (currentSeriesStatus) {
    currentSeriesStatus.forEach(s => {
      if (s.current_status === 'in_workshop') diagQueue++;
      else if (s.current_status === 'in_qc') repQueue++;
      else if (s.current_status === 'ready_to_dispatch') reacQueue++;
      else if (s.current_status === 'in_validation') qcQueue++;
      else if (s.current_status === 'in_control_warehouse') l3Queue++;
      else if (s.current_status === 'irreparable' || s.current_status === 'scrapped') scrapQueue++;
      else if (s.current_status === 'in_central_warehouse') listoQueue++;
    });
  }

  return [
    {
      id: 'recepcion',
      name: 'Recepción General',
      mainMetric: 'Unidades Recibidas',
      mainValue: recepcionUnits,
      subMetric1: 'Cajas Procesadas',
      subValue1: recepcionBoxes,
      subMetric2: 'Devoluciones',
      subValue2: devolucionesCount || 0,
      status: devolucionesCount && devolucionesCount > 10 ? 'warning' : 'good',
      users: recepcionUsers
    },
    {
      id: 'backoffice',
      name: 'Backoffices',
      mainMetric: 'En Validación',
      mainValue: backofficeCount || 0,
      subMetric1: 'Aprobados',
      subValue1: 0,
      subMetric2: 'Rechazados',
      subValue2: 0,
      status: backofficeCount && backofficeCount > 50 ? 'warning' : 'good',
      users: backofficeUsers
    },
    {
      id: 'bodega',
      name: 'Bodega Central',
      mainMetric: 'Movimientos',
      mainValue: bodegaCount || 0,
      subMetric1: 'Ingresos',
      subValue1: bodegaCount || 0,
      subMetric2: 'Salidas',
      subValue2: 0,
      status: 'good',
      users: bodegaUsers
    },
    {
      id: 'despacho',
      name: 'Despacho',
      mainMetric: 'Despachos Realizados',
      mainValue: despachoCount || 0,
      subMetric1: 'Cajas Despachadas',
      subValue1: 0,
      subMetric2: 'Pendientes',
      subValue2: 0,
      status: 'good',
      users: despachoUsers
    },
    {
      id: 'diagnostico',
      name: 'Diagnóstico',
      mainMetric: 'En Bandeja',
      mainValue: diagQueue,
      subMetric1: 'Procesados Hoy',
      subValue1: 0,
      subMetric2: 'TAT Promedio',
      subValue2: '18h',
      status: 'good',
      users: tallerUsers
    },
    {
      id: 'reparacion',
      name: 'Reparación',
      mainMetric: 'En Bandeja',
      mainValue: repQueue,
      subMetric1: 'Reparados Hoy',
      subValue1: 0,
      subMetric2: 'TAT Promedio',
      subValue2: '24h',
      status: 'good',
      users: tallerUsers
    },
    {
      id: 'reacondicionado',
      name: 'Reacondicionado',
      mainMetric: 'En Bandeja',
      mainValue: reacQueue,
      subMetric1: 'Completados Hoy',
      subValue1: 0,
      subMetric2: 'TAT Promedio',
      subValue2: '12h',
      status: 'good',
      users: tallerUsers
    },
    {
      id: 'control_calidad',
      name: 'Control de Calidad',
      mainMetric: 'En Bandeja',
      mainValue: qcQueue,
      subMetric1: 'Aprobados Hoy',
      subValue1: 0,
      subMetric2: 'Rechazados Hoy',
      subValue2: 0,
      status: 'good',
      users: tallerUsers
    },
    {
      id: 'l3_avanzado',
      name: 'L3 Avanzado',
      mainMetric: 'En Bandeja',
      mainValue: l3Queue,
      subMetric1: 'Exitosas Hoy',
      subValue1: 0,
      subMetric2: 'Irreparables Hoy',
      subValue2: 0,
      status: 'good',
      users: tallerUsers
    },
    {
      id: 'scraps',
      name: 'Scraps',
      mainMetric: 'En Bandeja',
      mainValue: scrapQueue,
      subMetric1: 'Confirmados Hoy',
      subValue1: 0,
      subMetric2: 'Pendientes',
      subValue2: 0,
      status: 'good',
      users: tallerUsers
    },
    {
      id: 'equipo_listo',
      name: 'Equipo Listo',
      mainMetric: 'En Bandeja',
      mainValue: listoQueue,
      subMetric1: 'Finalizados Hoy',
      subValue1: equipoListoCount || 0,
      subMetric2: 'Eficiencia',
      subValue2: '100%',
      status: 'good',
      users: tallerUsers
    }
  ];
}

export async function getBIData() {
  const supabase = getSupabaseBrowserClient();
  const pricingTable = [
    { tech: 'EMTA', condition: 'REACONDICIONADO', price: 2.78, quantity: 0 },
    { tech: 'EMTA', condition: 'REPARADO', price: 4.32, quantity: 0 },
    { tech: 'STB-HFC', condition: 'REACONDICIONADO', price: 2.78, quantity: 0 },
    { tech: 'STB-HFC', condition: 'REPARADO', price: 3.64, quantity: 0 },
    { tech: 'ONT', condition: 'REACONDICIONADO', price: 2.78, quantity: 0 },
    { tech: 'ONT', condition: 'REPARADO', price: 3.64, quantity: 0 },
    { tech: 'DTH', condition: 'REACONDICIONADO', price: 4.97, quantity: 0 },
    { tech: 'DTH', condition: 'REPARADO', price: 5.97, quantity: 0 },
    { tech: 'IPTV', condition: 'REACONDICIONADO', price: 2.78, quantity: 0 },
    { tech: 'IPTV', condition: 'REPARADO', price: 3.64, quantity: 0 },
    { tech: 'SWITCH', condition: 'REACONDICIONADO', price: 2.16, quantity: 0 },
    { tech: 'XDSL', condition: 'REACONDICIONADO', price: 3.64, quantity: 0 },
    { tech: 'XDSL', condition: 'REPARADO', price: 3.64, quantity: 0 },
  ];

  if (!supabase) return pricingTable;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  // Fetch workshop jobs — model vía service_orders.model_id (evita embed ambiguo series↔OS)
  const { data: jobs, error: jobsError } = await supabase
    .from('workshop_jobs')
    .select(`
      result,
      service_orders (
        models ( name )
      )
    `)
    .gte('created_at', startOfMonth.toISOString())
    .lte('created_at', endOfDay.toISOString());

  if (jobsError) {
    console.warn('getBIData workshop_jobs:', jobsError.message);
  }

  if (jobs) {
    jobs.forEach((job: any) => {
      // Determine condition
      let condition = '';
      if (job.result === 'reacondicionado') condition = 'REACONDICIONADO';
      else if (job.result === 'reparacion' || job.result === 'reparado') condition = 'REPARADO';
      
      if (!condition) return;

      const modelName = String(job.service_orders?.models?.name || '').toUpperCase();

      // Determine technology from model name (fallback to ONT if not found to catch stragglers, or just try to match)
      let tech = 'ONT'; // default
      if (modelName.includes('EMTA')) tech = 'EMTA';
      else if (modelName.includes('STB') || modelName.includes('HFC')) tech = 'STB-HFC';
      else if (modelName.includes('DTH')) tech = 'DTH';
      else if (modelName.includes('IPTV')) tech = 'IPTV';
      else if (modelName.includes('SWITCH')) tech = 'SWITCH';
      else if (modelName.includes('XDSL') || modelName.includes('DSL')) tech = 'XDSL';
      else if (modelName.includes('ONT')) tech = 'ONT';

      // Find row in pricing table and increment
      const row = pricingTable.find(r => r.tech === tech && r.condition === condition);
      if (row) {
        row.quantity++;
      } else {
        // Fallback for switch with reparado that doesn't exist in table?
        const fallbackRow = pricingTable.find(r => r.tech === 'ONT' && r.condition === condition);
        if (fallbackRow) fallbackRow.quantity++;
      }
    });
  }

  return pricingTable;
}

export async function getStorageData() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { ingresados: 0, despachados: 0, sinMovimiento60: 0, sinMovimiento90: 0 };

  const { count: ingresados } = await supabase
    .from('series')
    .select(COUNT_HEAD, { count: 'exact', head: true });

  const { count: despachados } = await supabase
    .from('series')
    .select(COUNT_HEAD, { count: 'exact', head: true })
    .eq('current_status', 'dispatched');

  const date60 = new Date();
  date60.setDate(date60.getDate() - 60);

  const date90 = new Date();
  date90.setDate(date90.getDate() - 90);

  const { count: sinMovimiento60 } = await supabase
    .from('series')
    .select(COUNT_HEAD, { count: 'exact', head: true })
    .neq('current_status', 'dispatched')
    .lt('updated_at', date60.toISOString())
    .gte('updated_at', date90.toISOString()); // only those between 60 and 90

  const { count: sinMovimiento90 } = await supabase
    .from('series')
    .select(COUNT_HEAD, { count: 'exact', head: true })
    .neq('current_status', 'dispatched')
    .lt('updated_at', date90.toISOString()); // older than 90 days

  return {
    ingresados: ingresados || 0,
    despachados: despachados || 0,
    sinMovimiento60: sinMovimiento60 || 0, // between 60 and 90
    sinMovimiento90: sinMovimiento90 || 0  // > 90
  };
}
