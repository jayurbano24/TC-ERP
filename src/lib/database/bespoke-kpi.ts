import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export async function getBespokeKPIs() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);
  const startIso = startOfDay.toISOString();
  const endIso = endOfDay.toISOString();

  // We need users to map names
  const { data: usersData } = await supabase
    .from('profiles')
    .select('id, full_name, user_roles(role), employees(nombre_completo)')
    .eq('is_active', true);

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

  const getNamesByRoles = (roles: string[]) => {
    return usersData
      ?.filter(u => u.user_roles?.some((ur: any) => roles.includes(ur.role)))
      .map(u => ({ id: u.id, name: getUserName(u.id), count: 0 })) || [];
  };

  // ---- 1. Recepcion General ----
  const { data: receptions } = await supabase.from('receptions').select('id, received_units, received_by, courier, origen_cac, created_at').gte('created_at', startIso).lte('created_at', endIso);
  let cajasRecibidasHoy = receptions?.length || 0;
  let totalUnidades = receptions?.reduce((acc: number, r: any) => acc + (r.received_units || 0), 0) || 0;
  let origenCac = receptions?.filter(r => r.origen_cac).length || 0;
  let origenPx = cajasRecibidasHoy - origenCac;

  const couriersSet = new Set(receptions?.map(r => r.courier?.trim() || 'Desconocido'));
  const activeCouriers = Array.from(couriersSet).filter(Boolean);

  const getCouriersSummary = (isDevolucion: boolean) => {
    // Para simplificar, si no hay campo explícito de devolución, asumiremos ingresos para todos
    // Pero si hubiese lógica, la aplicaríamos aquí.
    if (isDevolucion) return []; 
    return activeCouriers.map(c => {
      const items = receptions?.filter(r => (r.courier?.trim() || 'Desconocido') === c) || [];
      const cajas = items.length;
      const unidades = items.reduce((a, b) => a + (b.received_units || 0), 0);
      return { courier: c, cajas, procesadasHoy: cajas, acumulada: unidades };
    }).sort((a, b) => b.cajas - a.cajas);
  };

  // ---- 2. Backoffice ----
  const { count: backofficePendientesCount } = await supabase.from('series').select('id', { count: 'exact', head: true }).eq('current_status', 'in_validation');
  
  const backofficeUsersBase = getNamesByRoles(['admin', 'supervisor', 'gerencia', 'BACKOFFICES', 'BACKOFFICES-LBT', 'GERENTE GENERAL']);
  
  const { data: auditBackoffice } = await supabase
    .from('erp_audit_logs')
    .select('user_id, action')
    .in('action', ['RECEPCIÓN CAC', 'RECEPCIÓN PX'])
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  const backofficeCounts = (auditBackoffice || []).reduce((acc: any, log: any) => {
    const userName = getUserName(log.user_id);
    acc[userName] = (acc[userName] || 0) + 1;
    return acc;
  }, {});

  const registradasHoyTotal = (auditBackoffice || []).length;

  const registroTable = backofficeUsersBase.map(u => ({ 
    usuario: u.name, 
    registradas: backofficeCounts[u.name] || 0, 
    tecnologia: '—', 
    estado: 'Ok' 
  })).filter(u => u.registradas > 0);

  // If empty, add a default row so the UI doesn't look broken
  if (registroTable.length === 0) {
    registroTable.push({ usuario: 'Sin registros', registradas: 0, tecnologia: '—', estado: 'Ok' });
  }

  const devolucionesTable = backofficeUsersBase.map(u => ({ usuario: u.name, devoluciones: 0, diasEspera: 0, estado: 'Ok' })).filter(u => (backofficeCounts[u.usuario] || 0) > 0);
  if (devolucionesTable.length === 0) devolucionesTable.push({ usuario: 'Sin registros', devoluciones: 0, diasEspera: 0, estado: 'Ok' });

  const metasTable = backofficeUsersBase.map(u => {
    const logrado = backofficeCounts[u.name] || 0;
    return { tecnico: u.name, meta: 100, logrado, retornoMalo: 0 };
  }).filter(u => u.logrado > 0);
  if (metasTable.length === 0) {
    metasTable.push({ tecnico: 'Sin registros', meta: 0, logrado: 0, retornoMalo: 0 } as any);
  }
  
  const { data: techsData } = await supabase.from('system_technologies').select('id, name');
  const techMap = new Map(techsData?.map(t => [t.id, t.name]) || []);
  const techList = Array.from(techMap.values());

  const backofficeTechStats: Record<string, any> = {};
  const bckReceptions = await supabase.from('receptions').select('id, notes, received_units').gte('created_at', startIso).lte('created_at', endIso);
  bckReceptions.data?.forEach(r => {
    let tName = 'EQUIPO';
    if (r.notes) {
       const tMatch = r.notes.match(/Backoffice_Tech:\s*([^\s\n]+)/);
       if (tMatch) tName = tMatch[1];
    }
    if (!backofficeTechStats[tName]) backofficeTechStats[tName] = { ingresada: 0, acumuladaSemana: 0, acumuladaMes: 0 };
    backofficeTechStats[tName].ingresada += (r.received_units || 0);
  });
  const backofficeTechTable = Object.keys(backofficeTechStats).map(t => ({
    tecnologia: t, ...backofficeTechStats[t]
  })).filter(t => t.ingresada > 0);

  // ---- 3. Bodega ----
  const { data: pendientesSeriesBodega } = await supabase.from('series').select('id, models(technology_id)').in('current_status', ['RECEPCIONADO_BODEGA_GENERAL']);
  const pendientesIngreso = pendientesSeriesBodega?.length || 0;
  const pendientesBodegaByTech: Record<string, number> = {};
  pendientesSeriesBodega?.forEach(s => {
    const tId = Array.isArray(s.models) ? s.models[0]?.technology_id : s.models?.technology_id;
    const techName = techMap.get(tId) || 'EQUIPO';
    pendientesBodegaByTech[techName] = (pendientesBodegaByTech[techName] || 0) + 1;
  });

  const { count: totalBodega } = await supabase.from('series').select('id', { count: 'exact', head: true }).in('current_status', ['in_central_warehouse', 'in_control_warehouse', 'RECEPCIONADO_BODEGA_GENERAL']);
  
  const bodegaUsersBase = getNamesByRoles(['bodega', 'BODEGA RFB']);
  
  const { data: auditBodega } = await supabase
    .from('erp_audit_logs')
    .select('user_id, action, record_id')
    .in('action', ['INGRESO BODEGA'])
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  const bodegaRecordIds = auditBodega?.map(a => a.record_id).filter(Boolean) || [];
  const { data: bodegaSeriesData } = bodegaRecordIds.length > 0 ? await supabase.from('series').select('id, models(technology_id)').in('id', bodegaRecordIds) : { data: [] };
  const bodegaSeriesMap = new Map(bodegaSeriesData?.map(s => [s.id, s]) || []);

  const ingresosBodegaByTech: Record<string, number> = {};
  auditBodega?.forEach(log => {
    const s = bodegaSeriesMap.get(log.record_id);
    const tId = Array.isArray(s?.models) ? s?.models[0]?.technology_id : s?.models?.technology_id;
    const techName = techMap.get(tId) || 'EQUIPO';
    ingresosBodegaByTech[techName] = (ingresosBodegaByTech[techName] || 0) + 1;
  });

  const bodegaCounts = (auditBodega || []).reduce((acc: any, log: any) => {
    const userName = getUserName(log.user_id);
    acc[userName] = (acc[userName] || 0) + 1;
    return acc;
  }, {});

  const ingresadasBodegaTotal = (auditBodega || []).length;

  const ingresosBodegaTable = bodegaUsersBase.map(u => ({ 
    usuario: u.name, 
    ingresadas: bodegaCounts[u.name] || 0, 
    tecnologia: '—', 
    estado: 'Ok' 
  })).filter(u => u.ingresadas > 0);

  if (ingresosBodegaTable.length === 0) {
    ingresosBodegaTable.push({ usuario: 'Sin ingresos', ingresadas: 0, tecnologia: '—', estado: 'Ok' });
  }

  const allBodegaTechs = Array.from(new Set([...Object.keys(pendientesBodegaByTech), ...Object.keys(ingresosBodegaByTech)]));
  const pendientesTechTableBodega = allBodegaTechs.map(t => ({
    tecnologia: t,
    ingresadas: ingresosBodegaByTech[t] || 0,
    pendientes: pendientesBodegaByTech[t] || 0,
    estado: 'Ok'
  })).filter(t => t.ingresadas > 0 || t.pendientes > 0);

  // ---- 4. Taller ----
  const { count: pendientesDiagnostico } = await supabase.from('series').select('id', { count: 'exact', head: true }).eq('current_status', 'in_workshop');
  const { count: pendientesCC } = await supabase.from('series').select('id', { count: 'exact', head: true }).eq('current_status', 'in_qc');
  const { count: pendientesL3 } = await supabase.from('series').select('id', { count: 'exact', head: true }).eq('current_status', 'in_l3');
  const { count: pendientesScraps } = await supabase.from('series').select('id', { count: 'exact', head: true }).eq('current_status', 'in_scraps');
  
  const tallerUsersBase = getNamesByRoles(['tecnico', 'qc', 'OPERACION STB', 'SUPERVISOR STB']);
  
  const { data: auditTaller } = await supabase
    .from('erp_audit_logs')
    .select('user_id, action, new_values, record_id')
    .in('action', ['DIAGNÓSTICO INICIAL COMPLETADO', 'REACONDICIONADO COMPLETADO', 'REPARACIÓN COMPLETADA', 'CONTROL DE CALIDAD COMPLETADO'])
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  let kpiGoals: any[] = [];
  try {
    const { data } = await supabase.from('taller_kpi_goals').select('*');
    if (data) kpiGoals = data;
  } catch(e) {}

  const recordIds = auditTaller?.map(a => a.record_id).filter(Boolean) || [];
  let seriesData: any[] = [];
  if (recordIds.length > 0) {
    const { data } = await supabase.from('series').select('id, models(id, technology_id)').in('id', recordIds);
    if (data) seriesData = data;
  }
  const seriesMap = new Map(seriesData.map(s => [s.id, s]));

  const getProgressAndMeta = (userLogs: any[], stage: string, defaultDaily: number) => {
    if (!userLogs || userLogs.length === 0) return { meta: defaultDaily, semana: defaultDaily * 5, isBono: false };
    
    let totalProgress = 0;
    let totalWeeklyProgress = 0;

    userLogs.forEach(log => {
      const series = seriesMap.get(log.record_id);
      // Depending on how supabase returns joined models:
      const modelObj = Array.isArray(series?.models) ? series.models[0] : series?.models;
      const techId = modelObj?.technology_id;
      const modelId = modelObj?.id;
      
      let goal = kpiGoals.find(g => g.stage === stage && g.model_id === modelId && (g.user_id === log.user_id || !g.user_id));
      if (!goal) goal = kpiGoals.find(g => g.stage === stage && g.technology_id === techId && !g.model_id && (g.user_id === log.user_id || !g.user_id));
      if (!goal) goal = kpiGoals.find(g => g.stage === stage && !g.technology_id && !g.model_id && (g.user_id === log.user_id || !g.user_id));

      const daily = goal?.daily_goal || defaultDaily;
      const weekly = goal?.weekly_goal || defaultDaily * 5;

      totalProgress += 1 / daily;
      totalWeeklyProgress += 1 / weekly;
    });

    const isBono = totalProgress >= 1.05;
    const equivalentDailyMeta = Math.round(userLogs.length / totalProgress);
    const equivalentWeeklyMeta = Math.round(userLogs.length / totalWeeklyProgress);

    return {
      meta: equivalentDailyMeta || defaultDaily,
      semana: equivalentWeeklyMeta || defaultDaily * 5,
      isBono
    };
  };

  const diagLogs = (auditTaller || []).filter(a => a.action === 'DIAGNÓSTICO INICIAL COMPLETADO').reduce((acc: any, log: any) => {
    const userName = getUserName(log.user_id);
    if (!acc[userName]) acc[userName] = [];
    acc[userName].push(log);
    return acc;
  }, {});

  const reacondicionadoLogs = (auditTaller || []).filter(a => a.action === 'REACONDICIONADO COMPLETADO').reduce((acc: any, log: any) => {
    const userName = getUserName(log.user_id);
    if (!acc[userName]) acc[userName] = [];
    acc[userName].push(log);
    return acc;
  }, {});

  const reparacionLogs = (auditTaller || []).filter(a => a.action === 'REPARACIÓN COMPLETADA').reduce((acc: any, log: any) => {
    const userName = getUserName(log.user_id);
    if (!acc[userName]) acc[userName] = [];
    acc[userName].push(log);
    return acc;
  }, {});

  const ccAprobadosLogs = (auditTaller || []).filter(a => a.action === 'CONTROL DE CALIDAD COMPLETADO' && a.new_values?.result !== 'rechazado_qc').reduce((acc: any, log: any) => {
    const userName = getUserName(log.user_id);
    if (!acc[userName]) acc[userName] = [];
    acc[userName].push(log);
    return acc;
  }, {});

  const ccRechazadosLogs = (auditTaller || []).filter(a => a.action === 'CONTROL DE CALIDAD COMPLETADO' && a.new_values?.result === 'rechazado_qc').reduce((acc: any, log: any) => {
    const userName = getUserName(log.user_id);
    if (!acc[userName]) acc[userName] = [];
    acc[userName].push(log);
    return acc;
  }, {});

  const diagTotal = (auditTaller || []).filter(a => a.action === 'DIAGNÓSTICO INICIAL COMPLETADO').length;
  const reacTotal = (auditTaller || []).filter(a => a.action === 'REACONDICIONADO COMPLETADO').length;
  const repTotal = (auditTaller || []).filter(a => a.action === 'REPARACIÓN COMPLETADA').length;
  const ccAproTotal = (auditTaller || []).filter(a => a.action === 'CONTROL DE CALIDAD COMPLETADO' && a.new_values?.result !== 'rechazado_qc').length;
  const ccRechTotal = (auditTaller || []).filter(a => a.action === 'CONTROL DE CALIDAD COMPLETADO' && a.new_values?.result === 'rechazado_qc').length;

  const diagnosticoTable = tallerUsersBase.map(u => {
    const logs = diagLogs[u.name] || [];
    const stats = getProgressAndMeta(logs, 'diagnostico', 20);
    return { tecnico: u.name, procesadas: logs.length, meta: stats.meta, semana: stats.semana, pendientes: 0, estado: stats.isBono ? 'Bono' : 'Ok' };
  }).filter(u => u.procesadas > 0);
  if (diagnosticoTable.length === 0) diagnosticoTable.push({ tecnico: 'Sin registros', procesadas: '-', meta: '-', semana: '-', pendientes: '-', estado: 'Ok' });

  const reacondicionadoTable = tallerUsersBase.map(u => {
    const logs = reacondicionadoLogs[u.name] || [];
    const stats = getProgressAndMeta(logs, 'reacondicionado', 20);
    return { tecnico: u.name, completadas: logs.length, meta: stats.meta, semana: stats.semana, tat: '12h', estado: stats.isBono ? 'Bono' : 'Ok' };
  }).filter(u => u.completadas > 0);
  if (reacondicionadoTable.length === 0) reacondicionadoTable.push({ tecnico: 'Sin registros', completadas: '-', meta: '-', semana: '-', tat: '-', estado: 'Ok' });

  const reparacionTable = tallerUsersBase.map(u => {
    const logs = reparacionLogs[u.name] || [];
    const stats = getProgressAndMeta(logs, 'reparacion', 15);
    return { tecnico: u.name, reparadas: logs.length, meta: stats.meta, semana: stats.semana, enviadas: 0, estado: stats.isBono ? 'Bono' : 'Ok' };
  }).filter(u => u.reparadas > 0);
  if (reparacionTable.length === 0) reparacionTable.push({ tecnico: 'Sin registros', reparadas: '-', meta: '-', semana: '-', enviadas: '-', estado: 'Ok' });

  const qcUsersBase = getNamesByRoles(['qc', 'supervisor', 'SUPERVISOR STB']);
  const ccTable = qcUsersBase.map(u => {
    const logsA = ccAprobadosLogs[u.name] || [];
    const logsR = ccRechazadosLogs[u.name] || [];
    const allLogs = [...logsA, ...logsR];
    const stats = getProgressAndMeta(allLogs, 'qc', 35);
    return { inspector: u.name, aprobadas: logsA.length, meta: stats.meta, semana: stats.semana, rechazadas: logsR.length, tecnicoRechazado: '—', estado: stats.isBono ? 'Bono' : 'Ok' };
  }).filter(u => u.aprobadas > 0 || u.rechazadas > 0);
  if (ccTable.length === 0) ccTable.push({ inspector: 'Sin registros', aprobadas: '-', meta: '-', semana: '-', rechazadas: '-', tecnicoRechazado: '—', estado: 'Ok' });

  const tallerTechStats: Record<string, any> = {};
  auditTaller?.forEach(log => {
     const s = seriesMap.get(log.record_id);
     const tId = Array.isArray(s?.models) ? s?.models[0]?.technology_id : s?.models?.technology_id;
     const techName = techMap.get(tId) || 'EQUIPO';
     if (!tallerTechStats[techName]) tallerTechStats[techName] = { diagnostico: 0, reacondicionado: 0, reparacion: 0, cc: 0 };
     
     if (log.action === 'DIAGNÓSTICO INICIAL COMPLETADO') tallerTechStats[techName].diagnostico++;
     if (log.action === 'REACONDICIONADO COMPLETADO') tallerTechStats[techName].reacondicionado++;
     if (log.action === 'REPARACIÓN COMPLETADA') tallerTechStats[techName].reparacion++;
     if (log.action === 'CONTROL DE CALIDAD COMPLETADO') tallerTechStats[techName].cc++;
  });
  
  const tecnologiaProcesadaTable = Object.keys(tallerTechStats).map(t => ({
     tecnologia: t,
     ...tallerTechStats[t]
  })).filter(t => t.diagnostico > 0 || t.reacondicionado > 0 || t.reparacion > 0 || t.cc > 0);

  // ---- 5. Salida ----
  const { data: listosDespachoSeries } = await supabase.from('series').select('id, models(technology_id)').eq('current_status', 'ready_to_dispatch');
  const listosDespacho = listosDespachoSeries?.length || 0;
  
  const salidaPendientesByTech: Record<string, number> = {};
  listosDespachoSeries?.forEach(s => {
    const tId = Array.isArray(s.models) ? s.models[0]?.technology_id : s.models?.technology_id;
    const techName = techMap.get(tId) || 'EQUIPO';
    salidaPendientesByTech[techName] = (salidaPendientesByTech[techName] || 0) + 1;
  });

  const salidaActiveTechList = Object.keys(salidaPendientesByTech);

  const { data: despachosHoyData } = await supabase.from('dispatches').select('id').gte('created_at', startIso).lte('created_at', endIso);
  const despachosHoyCount = despachosHoyData?.length || 0;

  const despachoUsersBase = getNamesByRoles(['bodega', 'supervisor', 'BODEGA RFB']);
  
  const { data: auditSalida } = await supabase
    .from('erp_audit_logs')
    .select('user_id, action')
    .in('action', ['DESPACHO CREADO'])
    .gte('created_at', startIso)
    .lte('created_at', endIso);

  const salidaCounts = (auditSalida || []).reduce((acc: any, log: any) => {
    const userName = getUserName(log.user_id);
    acc[userName] = (acc[userName] || 0) + 1;
    return acc;
  }, {});

  const despachosUsuarioTable = despachoUsersBase.map(u => ({ 
    usuario: u.name, despachadas: salidaCounts[u.name] || 0, tecnologia: '—', estado: 'Ok' 
  })).filter(u => u.despachadas > 0);
  if (despachosUsuarioTable.length === 0) despachosUsuarioTable.push({ usuario: 'Sin registros', despachadas: 0, tecnologia: '—', estado: 'Ok' });

  const pendientesTechTableSalida = salidaActiveTechList.map(t => ({ 
    tecnologia: t, listas: salidaPendientesByTech[t] || 0, despachadas: 0, estado: 'Ok' 
  }));


  return {
    techList,
    recepcion: {
      pendientesVerificar: 0,
      sinAsignarBodega: 0,
      cajasRecibidasHoy,
      totalUnidades,
      origenCac,
      origenPx,
      tables: {
        ingresos: getCouriersSummary(false),
        devoluciones: getCouriersSummary(true),
        tecnologia: techList.map(t => ({ tecnologia: t, unidades: 0, estado: '—' }))
      }
    },
    backoffice: {
      devolucionesPendientesRetornar: 0,
      sinIngresarBodega: backofficePendientesCount || 0,
      registradasHoy: registradasHoyTotal,
      devolucionesPendientes: 0,
      ingresadasBodega: 0,
      tables: {
        registro: registroTable,
        devoluciones: devolucionesTable,
        metas: metasTable,
        tecnologia: backofficeTechTable
      }
    },
    bodega: {
      unidadesPendientes: pendientesIngreso || 0,
      sinTecnologia: 0,
      ingresadasBodega: ingresadasBodegaTotal,
      pendienteIngresar: pendientesIngreso || 0,
      totalEnBodega: totalBodega || 0,
      tables: {
        ingresos: ingresosBodegaTable,
        pendientes: pendientesTechTableBodega
      }
    },
    taller: {
      pendientesDiagnostico,
      pendientesCC,
      pendientesL3,
      pendientesScraps,
      diagnosticadas: diagTotal,
      reacondicionadas: reacTotal,
      reparadas: repTotal,
      aprobadasCC: ccAproTotal,
      rechazadasCC: ccRechTotal,
      tables: {
        diagnostico: diagnosticoTable,
        reacondicionado: reacondicionadoTable,
        reparacion: reparacionTable,
        cc: ccTable,
        tecnologia: tecnologiaProcesadaTable
      }
    },
    salida: {
      listosDespacho: listosDespacho || 0,
      despachadosHoy: despachosHoyCount,
      despachadasHoy: despachosHoyCount,
      listasDespacho: listosDespacho || 0,
      pendientesSalida: listosDespacho || 0,
      activeTechs: salidaActiveTechList,
      techListCount: salidaPendientesByTech,
      tables: {
        despachos: despachosUsuarioTable,
        pendientes: pendientesTechTableSalida
      }
    }
  };
}
