import { useMemo } from 'react';

export type AttendanceState = 
  | 'NO_INGRESO' 
  | 'LABORANDO' 
  | 'DESAYUNO' 
  | 'ALMUERZO' 
  | 'COMISION' 
  | 'PERMISO' 
  | 'SALIDA_FINAL';

export type AllowedAction = 
  | 'INGRESO' 
  | 'DESAYUNO_INICIO'
  | 'DESAYUNO_FIN'
  | 'ALMUERZO_INICIO'
  | 'ALMUERZO_FIN'
  | 'SALIDA_FINAL' 
  | 'MARCAJE_ESPECIAL'
  // Old compatibility
  | 'SALIDA_REFACCION'
  | 'REGRESO_REFACCION'
  | 'SALIDA_ALMUERZO'
  | 'REGRESO_ALMUERZO';

interface UseAttendanceStateProps {
  logs: any[];
  shift: any;
  policies: any;
}

/** Parsea "HH:MM" o "HH:MM:SS" a minutos del día. */
export function parsePolicyTimeToMins(timeStr: string | undefined, defaultMins: number): number {
  if (!timeStr) return defaultMins;
  const parts = String(timeStr).split(':');
  if (parts.length < 2) return defaultMins;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return defaultMins;
  return h * 60 + m;
}

/** Ventana de permisos especiales (marcaje especial) según políticas. */
export function isWithinPermissionWindow(policies: any, now: Date = new Date()): boolean {
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const start = parsePolicyTimeToMins(policies?.horario_permiso_inicio, 0);
  const end = parsePolicyTimeToMins(policies?.horario_permiso_fin, 23 * 60 + 59);
  if (start <= end) return currentMins >= start && currentMins <= end;
  // Cruce de medianoche
  return currentMins >= start || currentMins <= end;
}

export function useAttendanceState({ logs, shift, policies }: UseAttendanceStateProps) {
  
  const {
    currentState,
    lastLog,
    yaDesayuno,
    yaAlmorzo
  } = useMemo(() => {
    let state: AttendanceState = 'NO_INGRESO';
    let yaDesayuno = false;
    let yaAlmorzo = false;

    if (!logs || logs.length === 0) {
      return { currentState: state, lastLog: null, yaDesayuno, yaAlmorzo };
    }

    const sortedLogs = [...logs].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    for (const log of sortedLogs) {
      const event = log.evento_detectado?.trim().toUpperCase().replace(/ /g, '_');
      if (event === 'INGRESO' || event === 'INGRESO_ESPECIAL') {
        state = 'LABORANDO';
      } else if (event === 'SALIDA_REFACCION' || event === 'DESAYUNO_INICIO') {
        state = 'DESAYUNO';
      } else if (event === 'REGRESO_REFACCION' || event === 'DESAYUNO_FIN') {
        state = 'LABORANDO';
        yaDesayuno = true;
      } else if (event === 'SALIDA_ALMUERZO' || event === 'ALMUERZO_INICIO') {
        state = 'ALMUERZO';
      } else if (event === 'REGRESO_ALMUERZO' || event === 'ALMUERZO_FIN') {
        state = 'LABORANDO';
        yaAlmorzo = true;
      } else if (event === 'SALIDA_FINAL') {
        state = 'SALIDA_FINAL';
      } else if (event === 'SALIDA_COMISION') {
        state = 'COMISION';
      } else if (event === 'REGRESO_COMISION') {
        state = 'LABORANDO';
      }
    }

    return { 
      currentState: state, 
      lastLog: sortedLogs[sortedLogs.length - 1], 
      yaDesayuno, 
      yaAlmorzo 
    };
  }, [logs]);

  const allowedActions = useMemo<AllowedAction[]>(() => {
    const actions: AllowedAction[] = [];
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();

    const desayunoStart = shift?.ventana_desayuno_inicio
      ? parsePolicyTimeToMins(shift.ventana_desayuno_inicio, 9 * 60)
      : parsePolicyTimeToMins(policies?.horario_desayuno_inicio, 9 * 60);
    const desayunoEnd = shift?.ventana_desayuno_fin
      ? parsePolicyTimeToMins(shift.ventana_desayuno_fin, 10 * 60 + 15)
      : parsePolicyTimeToMins(policies?.horario_desayuno_fin, 10 * 60 + 15);
    
    const almuerzoStart = shift?.ventana_almuerzo_inicio
      ? parsePolicyTimeToMins(shift.ventana_almuerzo_inicio, 12 * 60)
      : parsePolicyTimeToMins(policies?.horario_almuerzo_inicio, 12 * 60);
    const almuerzoEnd = shift?.ventana_almuerzo_fin
      ? parsePolicyTimeToMins(shift.ventana_almuerzo_fin, 15 * 60 + 30)
      : parsePolicyTimeToMins(policies?.horario_almuerzo_fin, 15 * 60 + 30);

    switch (currentState) {
      case 'NO_INGRESO':
      case 'SALIDA_FINAL':
        actions.push('INGRESO');
        break;
      case 'LABORANDO':
        if (!yaDesayuno && (policies?.regla_permitir_desayuno_tarde || (currentMins >= desayunoStart && currentMins <= desayunoEnd))) {
          actions.push('SALIDA_REFACCION');
        }
        if (!yaAlmorzo && (policies?.regla_permitir_almuerzo_tarde || (currentMins >= almuerzoStart && currentMins <= almuerzoEnd))) {
          actions.push('SALIDA_ALMUERZO');
        }
        actions.push('SALIDA_FINAL');
        break;
      case 'DESAYUNO':
        actions.push('REGRESO_REFACCION');
        break;
      case 'ALMUERZO':
        actions.push('REGRESO_ALMUERZO');
        break;
      case 'COMISION':
        break;
    }

    if (policies?.permitir_marcaje_especial && isWithinPermissionWindow(policies, now)) {
      actions.push('MARCAJE_ESPECIAL');
    }

    return actions;
  }, [currentState, yaDesayuno, yaAlmorzo, shift, policies]);

  const calculatePunches = (action: AllowedAction) => {
    const now = new Date();
    const nowTime = now.getTime();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const currentDay = (now.getDay() || 7).toString();
    const daySchedule = shift?.weekly_schedule ? shift.weekly_schedule[currentDay] : null;
    const esDiaExtra = !daySchedule;
    
    // Antiguos (Minutos)
    let minRetraso = 0, minExcesoBreak = 0, minExcesoAlm = 0, minSalidaAnt = 0, minExtra = 0;
    
    // Nuevos (Segundos)
    let tardanza_segundos = 0, exceso_desayuno_segundos = 0, exceso_almuerzo_segundos = 0;
    let salida_anticipada_segundos = 0, horas_extra_segundos = 0;
    let estado_marcacion = 'NORMAL';

    const tolIngreso = policies?.tolerancia_ingreso_min ?? 10;
    /** Minutos permitidos antes del fin de turno sin justificar (salida anticipada). */
    const graciaSalidaAnt = policies?.tolerancia_salida_min ?? 5;
    const duracionDesayuno = shift?.duracion_desayuno_override ?? policies?.duracion_desayuno_min ?? 15;
    const duracionAlmuerzo = shift?.duracion_almuerzo_override ?? policies?.duracion_almuerzo_min ?? 60;
    const maxExcesoReceso = policies?.gracia_recesos_min ?? policies?.max_exceso_receso_min ?? 5; 

    if (action === 'INGRESO') {
      if (daySchedule) {
        const shiftEntradaMins = parseInt(daySchedule.entrada.split(':')[0]) * 60 + parseInt(daySchedule.entrada.split(':')[1]);
        if (currentMins > shiftEntradaMins + tolIngreso) {
          minRetraso = currentMins - shiftEntradaMins;
        }
        const [h, m, s] = (daySchedule.entrada + ':00').split(':').map(Number);
        const scheduledTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s || 0).getTime();
        const toleranciaMs = tolIngreso * 60 * 1000;
        
        if (nowTime > scheduledTime + toleranciaMs) {
          tardanza_segundos = Math.floor((nowTime - scheduledTime) / 1000);
          estado_marcacion = 'TARDE';
        }
      }
    } 
    else if (action === 'DESAYUNO_FIN' || action === 'REGRESO_REFACCION') {
      const salidaRef = logs?.find((l: any) => l.evento_detectado === 'DESAYUNO_INICIO' || l.evento_detectado === 'SALIDA_REFACCION');
      if (salidaRef) {
        const breakStartTime = new Date(salidaRef.timestamp).getTime();
        const diffMins = Math.floor((nowTime - breakStartTime) / 60000);
        if (diffMins > (duracionDesayuno + maxExcesoReceso)) {
          minExcesoBreak = diffMins - duracionDesayuno; 
        }
        const durationSeg = Math.floor((nowTime - breakStartTime) / 1000);
        const limitSeg = (duracionDesayuno + maxExcesoReceso) * 60;
        if (durationSeg > limitSeg) {
          exceso_desayuno_segundos = durationSeg - (duracionDesayuno * 60);
          estado_marcacion = 'EXCESO_DESAYUNO';
        }
      }
    }
    else if (action === 'ALMUERZO_FIN' || action === 'REGRESO_ALMUERZO') {
      const salidaAlm = logs?.find((l: any) => l.evento_detectado === 'ALMUERZO_INICIO' || l.evento_detectado === 'SALIDA_ALMUERZO');
      if (salidaAlm) {
        const almStartTime = new Date(salidaAlm.timestamp).getTime();
        const diffMins = Math.floor((nowTime - almStartTime) / 60000);
        if (diffMins > (duracionAlmuerzo + maxExcesoReceso)) {
          minExcesoAlm = diffMins - duracionAlmuerzo;
        }
        const durationSeg = Math.floor((nowTime - almStartTime) / 1000);
        const limitSeg = (duracionAlmuerzo + maxExcesoReceso) * 60;
        if (durationSeg > limitSeg) {
          exceso_almuerzo_segundos = durationSeg - (duracionAlmuerzo * 60);
          estado_marcacion = 'EXCESO_ALMUERZO';
        }
      }
    }
    else if (action === 'SALIDA_FINAL') {
      if (esDiaExtra) {
        const ingresoLog = logs?.find((l: any) => l.evento_detectado === 'INGRESO' || l.evento_detectado === 'INGRESO_ESPECIAL');
        if (ingresoLog) {
          const ingresoTime = new Date(ingresoLog.timestamp).getTime();
          minExtra = Math.floor((nowTime - ingresoTime) / 60000); 
          horas_extra_segundos = Math.floor((nowTime - ingresoTime) / 1000);
          estado_marcacion = 'EXTRA';
        }
      } else if (daySchedule) {
         const [h, m, s] = (daySchedule.salida + ':00').split(':').map(Number);
         const scheduledTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s || 0).getTime();
         const graciaAntMs = graciaSalidaAnt * 60 * 1000;
         const earliestWithoutJustif = scheduledTime - graciaAntMs;
         
         const shiftSalidaMins = h * 60 + m;
         const minsEarly = shiftSalidaMins - currentMins;

         // Solo anticipada (y justificable) si sale antes de la gracia permitida
         if (nowTime < earliestWithoutJustif) {
           minSalidaAnt = minsEarly;
           salida_anticipada_segundos = Math.floor((scheduledTime - nowTime) / 1000);
           estado_marcacion = 'TEMPRANO';
         } else if (nowTime > scheduledTime && policies?.regla_calcular_horas_extra === true) {
           // Horas extra solo si la regla está activa en políticas
           minExtra = currentMins - shiftSalidaMins;
           horas_extra_segundos = Math.floor((nowTime - scheduledTime) / 1000);
           estado_marcacion = 'EXTRA';
         }
         // Dentro de [salida - gracia, salida]: NORMAL (sin justificación)
      }
    }

    return {
      minRetraso,
      minExcesoBreak,
      minExcesoAlm,
      minSalidaAnt,
      minExtra,
      tardanza_segundos,
      exceso_desayuno_segundos,
      exceso_almuerzo_segundos,
      salida_anticipada_segundos,
      horas_extra_segundos,
      estado_marcacion,
      esDiaExtra
    };
  };

  return {
    currentState,
    allowedActions,
    yaDesayuno,
    yaAlmorzo,
    calculatePunches
  };
}
