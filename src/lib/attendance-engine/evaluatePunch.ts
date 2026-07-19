import { calculatePunchMetrics } from './AttendanceCalculator';
import { resolveJustification, specialMarcajeOptions } from './JustificationEngine';
import { readPolicyMargins } from './PolicyEngine';
import {
  getDaySchedule,
  isInWindow,
  isNearOrPastShiftEnd,
  timeWindow,
} from './ScheduleEngine';
import { deriveStateFromLogs, nextStateForEvent } from './StateEngine';
import type {
  EngineState,
  EvaluatePunchInput,
  EvaluatePunchResult,
  IntentOption,
  PunchEvent,
  PunchMetrics,
} from './types';

function emptyMetrics(esDiaExtra: boolean): PunchMetrics {
  return {
    minRetraso: 0,
    minExcesoBreak: 0,
    minExcesoAlm: 0,
    minSalidaAnt: 0,
    minExtra: 0,
    tardanza_segundos: 0,
    exceso_desayuno_segundos: 0,
    exceso_almuerzo_segundos: 0,
    salida_anticipada_segundos: 0,
    horas_extra_segundos: 0,
    estado_marcacion: 'NORMAL',
    esDiaExtra,
  };
}

function finalizeEvent(params: {
  currentState: EngineState;
  evento: PunchEvent;
  metrics: PunchMetrics;
  yaDesayuno: boolean;
  yaAlmorzo: boolean;
  policies: EvaluatePunchInput['policies'];
  overrideJustificacion?: {
    requiereJustificacion: boolean;
    justificacionTipo: string | null;
    justificacionOptions: string[];
  };
}): EvaluatePunchResult {
  const j =
    params.overrideJustificacion ||
    resolveJustification({
      evento: params.evento,
      metrics: params.metrics,
      policies: params.policies,
    });

  return {
    currentState: params.currentState,
    nextState: nextStateForEvent(params.currentState, params.evento),
    evento: params.evento,
    needsIntent: false,
    intentOptions: [],
    intentPrompt: null,
    requiereJustificacion: j.requiereJustificacion,
    justificacionTipo: j.justificacionTipo,
    justificacionOptions: j.justificacionOptions,
    metrics: params.metrics,
    yaDesayuno: params.yaDesayuno,
    yaAlmorzo: params.yaAlmorzo,
  };
}

function laborandoIntentOptions(params: {
  yaDesayuno: boolean;
  yaAlmorzo: boolean;
  permitirEspecial: boolean;
}): IntentOption[] {
  const opts: IntentOption[] = [];
  if (!params.yaDesayuno) {
    opts.push({
      id: 'DESAYUNO_INICIO',
      label: 'Desayuno / Refacción',
      evento: 'DESAYUNO_INICIO',
    });
  }
  if (!params.yaAlmorzo) {
    opts.push({
      id: 'ALMUERZO_INICIO',
      label: 'Almuerzo',
      evento: 'ALMUERZO_INICIO',
    });
  }
  if (params.permitirEspecial) {
    opts.push({
      id: 'MARCAJE_ESPECIAL',
      label: 'Permiso / Marcaje especial',
      evento: 'MARCAJE_ESPECIAL',
    });
  }
  opts.push({
    id: 'SALIDA_FINAL',
    label: 'Finalizar turno',
    evento: 'SALIDA_FINAL',
  });
  return opts;
}

/**
 * Decide el evento de marcaje a partir del estado, horario y políticas.
 * Si `forcedEvent` está presente (tras UI de intención), calcula métricas/justificación de ese evento.
 */
export function evaluatePunch(input: EvaluatePunchInput): EvaluatePunchResult {
  const now = input.now ?? new Date();
  const { shift, logs, policies } = input;
  const derived = deriveStateFromLogs(logs);
  const margins = readPolicyMargins(policies, shift);
  const daySchedule = getDaySchedule(shift, now);
  const esDiaExtra = !daySchedule;
  const desayunoWin = timeWindow(shift, policies, 'desayuno');
  const almuerzoWin = timeWindow(shift, policies, 'almuerzo');
  const inDesayunoWin = isInWindow(now, desayunoWin.start, desayunoWin.end);
  const inAlmuerzoWin = isInWindow(now, almuerzoWin.start, almuerzoWin.end);
  // Auto solo dentro de ventana horaria (evita asumir desayuno a las 10:30 fuera de ventana).
  const canAutoDesayuno = !derived.yaDesayuno && inDesayunoWin;
  const canAutoAlmuerzo = !derived.yaAlmorzo && inAlmuerzoWin;

  // --- Evento forzado (tras elegir intención) ---
  if (input.forcedEvent) {
    const forced = input.forcedEvent;

    if (forced === 'INGRESO_ESPECIAL' || (forced === 'MARCAJE_ESPECIAL' && (derived.currentState === 'FUERA' || derived.currentState === 'SALIDA_FINAL'))) {
      const metrics = calculatePunchMetrics({
        evento: 'INGRESO',
        shift,
        logs,
        policies,
        now,
      });
      metrics.esDiaExtra = true;
      if (metrics.estado_marcacion === 'NORMAL') metrics.estado_marcacion = 'EXTRA';
      return finalizeEvent({
        currentState: derived.currentState,
        evento: 'INGRESO',
        metrics,
        yaDesayuno: derived.yaDesayuno,
        yaAlmorzo: derived.yaAlmorzo,
        policies,
        overrideJustificacion: {
          requiereJustificacion: true,
          justificacionTipo: 'MARCAJE_ESPECIAL',
          justificacionOptions: specialMarcajeOptions(policies),
        },
      });
    }

    if (forced === 'MARCAJE_ESPECIAL') {
      // Desde LABORANDO: el kiosco abre flujo especial (dirección + motivo)
      return {
        currentState: derived.currentState,
        nextState: derived.currentState,
        evento: 'MARCAJE_ESPECIAL',
        needsIntent: false,
        intentOptions: [],
        intentPrompt: null,
        requiereJustificacion: true,
        justificacionTipo: 'MARCAJE_ESPECIAL',
        justificacionOptions: specialMarcajeOptions(policies),
        metrics: emptyMetrics(esDiaExtra),
        yaDesayuno: derived.yaDesayuno,
        yaAlmorzo: derived.yaAlmorzo,
      };
    }

    const metrics = calculatePunchMetrics({
      evento: forced,
      shift,
      logs,
      policies,
      now,
    });
    return finalizeEvent({
      currentState: derived.currentState,
      evento: forced,
      metrics,
      yaDesayuno: derived.yaDesayuno,
      yaAlmorzo: derived.yaAlmorzo,
      policies,
    });
  }

  // --- FUERA / post SALIDA_FINAL ---
  if (derived.currentState === 'FUERA' || derived.currentState === 'SALIDA_FINAL') {
    if (esDiaExtra) {
      const metrics = emptyMetrics(true);
      metrics.estado_marcacion = 'EXTRA';
      return finalizeEvent({
        currentState: derived.currentState,
        evento: 'INGRESO',
        metrics,
        yaDesayuno: derived.yaDesayuno,
        yaAlmorzo: derived.yaAlmorzo,
        policies,
        overrideJustificacion: {
          requiereJustificacion: true,
          justificacionTipo: 'MARCAJE_ESPECIAL',
          justificacionOptions: specialMarcajeOptions(policies),
        },
      });
    }
    const metrics = calculatePunchMetrics({
      evento: 'INGRESO',
      shift,
      logs,
      policies,
      now,
    });
    return finalizeEvent({
      currentState: derived.currentState,
      evento: 'INGRESO',
      metrics,
      yaDesayuno: derived.yaDesayuno,
      yaAlmorzo: derived.yaAlmorzo,
      policies,
    });
  }

  // --- En receso ---
  if (derived.currentState === 'DESAYUNO') {
    const metrics = calculatePunchMetrics({
      evento: 'DESAYUNO_FIN',
      shift,
      logs,
      policies,
      now,
    });
    return finalizeEvent({
      currentState: derived.currentState,
      evento: 'DESAYUNO_FIN',
      metrics,
      yaDesayuno: derived.yaDesayuno,
      yaAlmorzo: derived.yaAlmorzo,
      policies,
    });
  }

  if (derived.currentState === 'ALMUERZO') {
    const metrics = calculatePunchMetrics({
      evento: 'ALMUERZO_FIN',
      shift,
      logs,
      policies,
      now,
    });
    return finalizeEvent({
      currentState: derived.currentState,
      evento: 'ALMUERZO_FIN',
      metrics,
      yaDesayuno: derived.yaDesayuno,
      yaAlmorzo: derived.yaAlmorzo,
      policies,
    });
  }

  // --- LABORANDO ---
  if (derived.currentState === 'LABORANDO') {
    // Si ambas ventanas aplican (flags tarde), preferir la ventana horaria real
    if (canAutoDesayuno && canAutoAlmuerzo) {
      if (inDesayunoWin && !inAlmuerzoWin) {
        return finalizeEvent({
          currentState: derived.currentState,
          evento: 'DESAYUNO_INICIO',
          metrics: calculatePunchMetrics({
            evento: 'DESAYUNO_INICIO',
            shift,
            logs,
            policies,
            now,
          }),
          yaDesayuno: derived.yaDesayuno,
          yaAlmorzo: derived.yaAlmorzo,
          policies,
        });
      }
      if (inAlmuerzoWin && !inDesayunoWin) {
        return finalizeEvent({
          currentState: derived.currentState,
          evento: 'ALMUERZO_INICIO',
          metrics: calculatePunchMetrics({
            evento: 'ALMUERZO_INICIO',
            shift,
            logs,
            policies,
            now,
          }),
          yaDesayuno: derived.yaDesayuno,
          yaAlmorzo: derived.yaAlmorzo,
          policies,
        });
      }
      // Ambas o ninguna clara → intención
    } else if (canAutoDesayuno && !canAutoAlmuerzo) {
      return finalizeEvent({
        currentState: derived.currentState,
        evento: 'DESAYUNO_INICIO',
        metrics: calculatePunchMetrics({
          evento: 'DESAYUNO_INICIO',
          shift,
          logs,
          policies,
          now,
        }),
        yaDesayuno: derived.yaDesayuno,
        yaAlmorzo: derived.yaAlmorzo,
        policies,
      });
    } else if (canAutoAlmuerzo && !canAutoDesayuno) {
      return finalizeEvent({
        currentState: derived.currentState,
        evento: 'ALMUERZO_INICIO',
        metrics: calculatePunchMetrics({
          evento: 'ALMUERZO_INICIO',
          shift,
          logs,
          policies,
          now,
        }),
        yaDesayuno: derived.yaDesayuno,
        yaAlmorzo: derived.yaAlmorzo,
        policies,
      });
    }

    if (daySchedule && isNearOrPastShiftEnd(daySchedule, now, margins.graciaSalidaAnt)) {
      return finalizeEvent({
        currentState: derived.currentState,
        evento: 'SALIDA_FINAL',
        metrics: calculatePunchMetrics({
          evento: 'SALIDA_FINAL',
          shift,
          logs,
          policies,
          now,
        }),
        yaDesayuno: derived.yaDesayuno,
        yaAlmorzo: derived.yaAlmorzo,
        policies,
      });
    }

    if (!margins.permitirDobleMarcaje) {
      return {
        currentState: derived.currentState,
        nextState: derived.currentState,
        evento: null,
        needsIntent: true,
        intentPrompt: '¿Motivo del marcaje?',
        intentOptions: laborandoIntentOptions({
          yaDesayuno: derived.yaDesayuno,
          yaAlmorzo: derived.yaAlmorzo,
          permitirEspecial: margins.permitirMarcajeEspecial,
        }),
        requiereJustificacion: false,
        justificacionTipo: null,
        justificacionOptions: [],
        metrics: emptyMetrics(false),
        yaDesayuno: derived.yaDesayuno,
        yaAlmorzo: derived.yaAlmorzo,
      };
    }

    return finalizeEvent({
      currentState: derived.currentState,
      evento: 'INGRESO',
      metrics: calculatePunchMetrics({
        evento: 'INGRESO',
        shift,
        logs,
        policies,
        now,
      }),
      yaDesayuno: derived.yaDesayuno,
      yaAlmorzo: derived.yaAlmorzo,
      policies,
    });
  }

  return {
    currentState: derived.currentState,
    nextState: derived.currentState,
    evento: null,
    needsIntent: true,
    intentPrompt: '¿Motivo del marcaje?',
    intentOptions: laborandoIntentOptions({
      yaDesayuno: derived.yaDesayuno,
      yaAlmorzo: derived.yaAlmorzo,
      permitirEspecial: margins.permitirMarcajeEspecial,
    }),
    requiereJustificacion: false,
    justificacionTipo: null,
    justificacionOptions: [],
    metrics: emptyMetrics(esDiaExtra),
    yaDesayuno: derived.yaDesayuno,
    yaAlmorzo: derived.yaAlmorzo,
  };
}
