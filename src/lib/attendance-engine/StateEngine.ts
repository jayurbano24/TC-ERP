import type { EngineState, TimeLogLike } from './types';

function normalizeEvent(raw: string | null | undefined): string {
  return (raw || '').trim().toUpperCase().replace(/ /g, '_');
}

export interface DerivedState {
  currentState: EngineState;
  lastLog: TimeLogLike | null;
  yaDesayuno: boolean;
  yaAlmorzo: boolean;
  sortedLogs: TimeLogLike[];
}

/** Deriva el estado interno a partir de los marcajes del día. */
export function deriveStateFromLogs(logs: TimeLogLike[] | null | undefined): DerivedState {
  let state: EngineState = 'FUERA';
  let yaDesayuno = false;
  let yaAlmorzo = false;

  if (!logs || logs.length === 0) {
    return { currentState: state, lastLog: null, yaDesayuno, yaAlmorzo, sortedLogs: [] };
  }

  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime(),
  );

  for (const log of sortedLogs) {
    const event = normalizeEvent(log.evento_detectado);
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
      } else if (event === 'SALIDA_FINAL' || event === 'SALIDA_OMITIDA') {
        state = 'SALIDA_FINAL';
      } else if (event === 'SALIDA_COMISION') {
      state = 'COMISION';
    } else if (event === 'REGRESO_COMISION') {
      state = 'LABORANDO';
    } else if (event === 'MARCAJE_ESPECIAL') {
      // Marcaje especial no cambia máquina salvo que sea dirección de entrada/salida
      // (la UI especial usa INGRESO/SALIDA_FINAL como evento real).
    }
  }

  return {
    currentState: state,
    lastLog: sortedLogs[sortedLogs.length - 1] || null,
    yaDesayuno,
    yaAlmorzo,
    sortedLogs,
  };
}

export function nextStateForEvent(current: EngineState, evento: string): EngineState {
  const e = normalizeEvent(evento);
  if (e === 'INGRESO' || e === 'INGRESO_ESPECIAL') return 'LABORANDO';
  if (e === 'DESAYUNO_INICIO' || e === 'SALIDA_REFACCION') return 'DESAYUNO';
  if (e === 'DESAYUNO_FIN' || e === 'REGRESO_REFACCION') return 'LABORANDO';
  if (e === 'ALMUERZO_INICIO' || e === 'SALIDA_ALMUERZO') return 'ALMUERZO';
  if (e === 'ALMUERZO_FIN' || e === 'REGRESO_ALMUERZO') return 'LABORANDO';
  if (e === 'SALIDA_FINAL' || e === 'SALIDA_OMITIDA') return 'SALIDA_FINAL';
  return current;
}
