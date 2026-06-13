import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type UserKPI = {
  user_id: string;
  name: string;
  role: string;
  target: number;
  progress: number;
  percentage: number;
};

export async function getDailyKPIs(): Promise<UserKPI[]> {
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

  // Obtener fecha de hoy inicio/fin en UTC
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const startIso = startOfDay.toISOString();
  const endIso = endOfDay.toISOString();

  // Recepciones de hoy
  const { data: receptions } = await supabase
    .from('receptions')
    .select('received_by, received_units')
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  // Bodega de hoy (movimientos / cajas creadas)
  // Contamos cuantas series fueron movidas o cajas cerradas por usuario.
  // Vamos a usar inventory_movements.
  const { data: movements } = await supabase
    .from('inventory_movements')
    .select('moved_by, id')
    .gte('moved_at', startIso)
    .lte('moved_at', endIso);

  // Taller (Diagnostic, Reparacion, etc)
  const { data: jobs } = await supabase
    .from('workshop_jobs')
    .select('technician_id, id')
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  // Mapear los contadores
  const progressMap: Record<string, number> = {};

  if (receptions) {
    receptions.forEach((r: any) => {
      if (r.received_by) {
        progressMap[r.received_by] = (progressMap[r.received_by] || 0) + (r.received_units || 0);
      }
    });
  }

  if (movements) {
    movements.forEach((m: any) => {
      if (m.moved_by) {
        progressMap[m.moved_by] = (progressMap[m.moved_by] || 0) + 1;
      }
    });
  }

  if (jobs) {
    jobs.forEach((j: any) => {
      if (j.technician_id) {
        progressMap[j.technician_id] = (progressMap[j.technician_id] || 0) + 1;
      }
    });
  }

  // Unificar todo
  const kpis: UserKPI[] = usersData
    .filter(u => u.is_active && u.user_roles && u.user_roles.length > 0)
    .map((userRow: any) => {
      const u = userRow as any;
      const roleStr = u.user_roles[0].role;
      const progress = progressMap[u.id] || 0;
      const targetObj = targetsData.find(t => t.user_id === u.id);
      
      // Intentar sacar nombre_completo
      let realName = u.full_name || 'Usuario';
      if (u.employees && Array.isArray(u.employees) && u.employees.length > 0 && u.employees[0].nombre_completo) {
        realName = u.employees[0].nombre_completo;
      } else if (u.employees && !Array.isArray(u.employees) && u.employees.nombre_completo) {
        realName = u.employees.nombre_completo;
      } else if (realName.includes('@')) {
        realName = realName.split('@')[0];
      }

      // Default target 100 if not set
      let target = targetObj ? targetObj.target_value : 100;

      return {
        user_id: u.id,
        name: realName,
        role: roleStr,
        target,
        progress,
        percentage: target > 0 ? Math.round((progress / target) * 100) : 0
      };
    });

  return kpis.sort((a, b) => b.percentage - a.percentage);
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

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { totalProduction: 0, activeTechnicians: 0, errorRate: 0, productionByBrand: [] };

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startIso = startOfDay.toISOString();

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

  // Producción por Marca
  // Obtenemos los equipos que se movieron hoy
  const { data: series } = await supabase
    .from('series')
    .select('id, brands(name)')
    .gte('updated_at', startIso);

  const brandCounts: Record<string, number> = {};
  if (series) {
    series.forEach((s: any) => {
      const brandName = s.brands?.name || 'GENERICO';
      brandCounts[brandName] = (brandCounts[brandName] || 0) + 1;
    });
  }

  const productionByBrand = Object.entries(brandCounts)
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

  // Fetch workshop jobs with deep relation to get the model name
  const { data: jobs } = await supabase
    .from('workshop_jobs')
    .select(`
      result,
      service_orders (
        series (
          models (
            name
          )
        )
      )
    `)
    .gte('created_at', startOfMonth.toISOString())
    .lte('created_at', endOfDay.toISOString());

  if (jobs) {
    jobs.forEach((job: any) => {
      // Determine condition
      let condition = '';
      if (job.result === 'reacondicionado') condition = 'REACONDICIONADO';
      else if (job.result === 'reparacion' || job.result === 'reparado') condition = 'REPARADO';
      
      if (!condition) return;

      // Extract model name
      let modelName = '';
      try {
        modelName = job.service_orders?.series?.models?.name || '';
      } catch (e) {}

      modelName = modelName.toUpperCase();

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
    .select('*', { count: 'exact', head: true });

  const { count: despachados } = await supabase
    .from('series')
    .select('*', { count: 'exact', head: true })
    .eq('current_status', 'dispatched');

  const date60 = new Date();
  date60.setDate(date60.getDate() - 60);

  const date90 = new Date();
  date90.setDate(date90.getDate() - 90);

  const { count: sinMovimiento60 } = await supabase
    .from('series')
    .select('*', { count: 'exact', head: true })
    .neq('current_status', 'dispatched')
    .lt('updated_at', date60.toISOString())
    .gte('updated_at', date90.toISOString()); // only those between 60 and 90

  const { count: sinMovimiento90 } = await supabase
    .from('series')
    .select('*', { count: 'exact', head: true })
    .neq('current_status', 'dispatched')
    .lt('updated_at', date90.toISOString()); // older than 90 days

  return {
    ingresados: ingresados || 0,
    despachados: despachados || 0,
    sinMovimiento60: sinMovimiento60 || 0, // between 60 and 90
    sinMovimiento90: sinMovimiento90 || 0  // > 90
  };
}
