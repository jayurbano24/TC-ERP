import { useMemo } from 'react';
import {
  deriveStateFromLogs,
  evaluatePunch,
  isWithinPermissionWindow,
  parsePolicyTimeToMins,
  type PunchEvent,
} from '@/lib/attendance-engine';

/** @deprecated Prefer EngineState from attendance-engine; kept for compat. */
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
  | 'SALIDA_REFACCION'
  | 'REGRESO_REFACCION'
  | 'SALIDA_ALMUERZO'
  | 'REGRESO_ALMUERZO';

export { parsePolicyTimeToMins, isWithinPermissionWindow };

interface UseAttendanceStateProps {
  logs: any[];
  shift: any;
  policies: any;
}

function toLegacyState(engine: string): AttendanceState {
  if (engine === 'FUERA') return 'NO_INGRESO';
  if (engine === 'LABORANDO') return 'LABORANDO';
  if (engine === 'DESAYUNO') return 'DESAYUNO';
  if (engine === 'ALMUERZO') return 'ALMUERZO';
  if (engine === 'COMISION') return 'COMISION';
  if (engine === 'PERMISO') return 'PERMISO';
  if (engine === 'SALIDA_FINAL') return 'SALIDA_FINAL';
  return 'NO_INGRESO';
}

function toLegacyAction(evento: PunchEvent | null): AllowedAction | null {
  if (!evento) return null;
  if (evento === 'DESAYUNO_INICIO') return 'DESAYUNO_INICIO';
  if (evento === 'DESAYUNO_FIN') return 'DESAYUNO_FIN';
  if (evento === 'ALMUERZO_INICIO') return 'ALMUERZO_INICIO';
  if (evento === 'ALMUERZO_FIN') return 'ALMUERZO_FIN';
  return evento as AllowedAction;
}

/**
 * Thin wrapper sobre attendance-engine (compat con pantallas legacy).
 * El kiosco inteligente debe usar `evaluatePunch` directamente.
 */
export function useAttendanceState({ logs, shift, policies }: UseAttendanceStateProps) {
  const derived = useMemo(() => deriveStateFromLogs(logs), [logs]);

  const currentState = toLegacyState(derived.currentState);

  const allowedActions = useMemo<AllowedAction[]>(() => {
    const decision = evaluatePunch({ shift, logs, policies, now: new Date() });
    const actions: AllowedAction[] = [];
    if (decision.needsIntent) {
      for (const opt of decision.intentOptions) {
        const a = toLegacyAction(opt.evento);
        if (a && !actions.includes(a)) actions.push(a);
      }
      return actions;
    }
    const a = toLegacyAction(decision.evento);
    if (a) actions.push(a);
    if (policies?.permitir_marcaje_especial && isWithinPermissionWindow(policies)) {
      if (!actions.includes('MARCAJE_ESPECIAL')) actions.push('MARCAJE_ESPECIAL');
    }
    return actions;
  }, [logs, shift, policies, derived.currentState]);

  const calculatePunches = (action: AllowedAction) => {
    const map: Record<string, PunchEvent> = {
      INGRESO: 'INGRESO',
      DESAYUNO_INICIO: 'DESAYUNO_INICIO',
      DESAYUNO_FIN: 'DESAYUNO_FIN',
      ALMUERZO_INICIO: 'ALMUERZO_INICIO',
      ALMUERZO_FIN: 'ALMUERZO_FIN',
      SALIDA_FINAL: 'SALIDA_FINAL',
      MARCAJE_ESPECIAL: 'MARCAJE_ESPECIAL',
      SALIDA_REFACCION: 'DESAYUNO_INICIO',
      REGRESO_REFACCION: 'DESAYUNO_FIN',
      SALIDA_ALMUERZO: 'ALMUERZO_INICIO',
      REGRESO_ALMUERZO: 'ALMUERZO_FIN',
    };
    const evento = map[action] || 'INGRESO';
    const decision = evaluatePunch({
      shift,
      logs,
      policies,
      now: new Date(),
      forcedEvent: evento,
    });
    return decision.metrics;
  };

  return {
    currentState,
    allowedActions,
    yaDesayuno: derived.yaDesayuno,
    yaAlmorzo: derived.yaAlmorzo,
    calculatePunches,
  };
}
