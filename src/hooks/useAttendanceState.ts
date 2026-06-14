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

    const desayunoStart = shift?.ventana_desayuno_inicio ? parseInt(shift.ventana_desayuno_inicio.split(':')[0]) * 60 + parseInt(shift.ventana_desayuno_inicio.split(':')[1]) : 9 * 60;
    const desayunoEnd = shift?.ventana_desayuno_fin ? parseInt(shift.ventana_desayuno_fin.split(':')[0]) * 60 + parseInt(shift.ventana_desayuno_fin.split(':')[1]) : 10 * 60 + 15;
    
    const almuerzoStart = shift?.ventana_almuerzo_inicio ? parseInt(shift.ventana_almuerzo_inicio.split(':')[0]) * 60 + parseInt(shift.ventana_almuerzo_inicio.split(':')[1]) : 12 * 60;
    const almuerzoEnd = shift?.ventana_almuerzo_fin ? parseInt(shift.ventana_almuerzo_fin.split(':')[0]) * 60 + parseInt(shift.ventana_almuerzo_fin.split(':')[1]) : 15 * 60 + 30;

    switch (currentState) {
      case 'NO_INGRESO':
      case 'SALIDA_FINAL':
        actions.push('INGRESO');
        break;
      case 'LABORANDO':
        if (!yaDesayuno && currentMins >= desayunoStart && currentMins <= desayunoEnd) {
          actions.push('DESAYUNO_INICIO');
        }
        if (!yaAlmorzo && currentMins >= almuerzoStart && currentMins <= almuerzoEnd) {
          actions.push('ALMUERZO_INICIO');
        }
        actions.push('SALIDA_FINAL');
        break;
      case 'DESAYUNO':
        actions.push('DESAYUNO_FIN');
        break;
      case 'ALMUERZO':
        actions.push('ALMUERZO_FIN');
        break;
      case 'COMISION':
        break;
    }

    if (policies?.permitir_marcaje_especial) {
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
    const tolSalida = policies?.tolerancia_salida_min ?? 10;
    const duracionDesayuno = shift?.duracion_desayuno_override ?? policies?.duracion_desayuno_min ?? 15;
    const duracionAlmuerzo = shift?.duracion_almuerzo_override ?? policies?.duracion_almuerzo_min ?? 60;
    const maxExcesoReceso = policies?.max_exceso_receso_min ?? 5; 

    if (action === 'INGRESO') {
      if (daySchedule) {
        // Cálculo antiguo
        const shiftEntradaMins = parseInt(daySchedule.entrada.split(':')[0]) * 60 + parseInt(daySchedule.entrada.split(':')[1]);
        if (currentMins > shiftEntradaMins + tolIngreso) {
          minRetraso = currentMins - shiftEntradaMins;
        }
        // Cálculo nuevo exacto
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
        // Antiguo
        const diffMins = Math.floor((nowTime - breakStartTime) / 60000);
        if (diffMins > (duracionDesayuno + maxExcesoReceso)) {
          minExcesoBreak = diffMins - duracionDesayuno; 
        }
        // Nuevo
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
        // Antiguo
        const diffMins = Math.floor((nowTime - almStartTime) / 60000);
        if (diffMins > (duracionAlmuerzo + maxExcesoReceso)) {
          minExcesoAlm = diffMins - duracionAlmuerzo;
        }
        // Nuevo
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
          // Antiguo
          minExtra = Math.floor((nowTime - ingresoTime) / 60000); 
          // Nuevo
          horas_extra_segundos = Math.floor((nowTime - ingresoTime) / 1000);
          estado_marcacion = 'EXTRA';
        }
      } else if (daySchedule) {
         const [h, m, s] = (daySchedule.salida + ':00').split(':').map(Number);
         const scheduledTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s || 0).getTime();
         const toleranciaSalidaMs = tolSalida * 60 * 1000;
         
         // Antiguo
         const shiftSalidaMins = h * 60 + m;
         if (currentMins < shiftSalidaMins) {
           minSalidaAnt = shiftSalidaMins - currentMins;
         } else if (currentMins > shiftSalidaMins + tolSalida) {
           minExtra = currentMins - shiftSalidaMins;
         }

         // Nuevo
         if (nowTime < scheduledTime) {
           salida_anticipada_segundos = Math.floor((scheduledTime - nowTime) / 1000);
           estado_marcacion = 'TEMPRANO';
         } else if (nowTime > scheduledTime + toleranciaSalidaMs) {
           horas_extra_segundos = Math.floor((nowTime - scheduledTime) / 1000);
           estado_marcacion = 'EXTRA';
         }
      }
    }

    return {
      // Old
      minRetraso,
      minExcesoBreak,
      minExcesoAlm,
      minSalidaAnt,
      minExtra,
      // New
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
