/** Estados internos del motor inteligente (Fase 1). */
export type EngineState =
  | 'FUERA'
  | 'LABORANDO'
  | 'DESAYUNO'
  | 'ALMUERZO'
  | 'PERMISO'
  | 'TRABAJO_EXTRA'
  | 'COMISION'
  | 'SALIDA_FINAL';

/** Eventos canónicos persistidos en time_logs. */
export type PunchEvent =
  | 'INGRESO'
  | 'DESAYUNO_INICIO'
  | 'DESAYUNO_FIN'
  | 'ALMUERZO_INICIO'
  | 'ALMUERZO_FIN'
  | 'SALIDA_FINAL'
  | 'MARCAJE_ESPECIAL'
  | 'INGRESO_ESPECIAL';

export type IntentChoice =
  | 'DESAYUNO_INICIO'
  | 'ALMUERZO_INICIO'
  | 'SALIDA_FINAL'
  | 'MARCAJE_ESPECIAL'
  | 'DIA_EXTRA';

export type MarcacionResultado =
  | 'NORMAL'
  | 'TARDE'
  | 'TEMPRANO'
  | 'EXCESO_DESAYUNO'
  | 'EXCESO_ALMUERZO'
  | 'EXTRA'
  | 'JUSTIFICADO';

export interface TimeLogLike {
  timestamp?: string;
  evento_detectado?: string | null;
  attendance_session_id?: string | null;
}

export interface DaySchedule {
  entrada?: string;
  salida?: string;
}

export interface ShiftLike {
  id?: string;
  weekly_schedule?: Record<string, DaySchedule | null | undefined>;
  ventana_desayuno_inicio?: string | null;
  ventana_desayuno_fin?: string | null;
  ventana_almuerzo_inicio?: string | null;
  ventana_almuerzo_fin?: string | null;
  duracion_desayuno_override?: number | null;
  duracion_almuerzo_override?: number | null;
}

export interface PoliciesLike {
  horario_desayuno_inicio?: string;
  horario_desayuno_fin?: string;
  horario_almuerzo_inicio?: string;
  horario_almuerzo_fin?: string;
  horario_permiso_inicio?: string;
  horario_permiso_fin?: string;
  tolerancia_ingreso_min?: number;
  tolerancia_salida_min?: number;
  gracia_recesos_min?: number;
  max_exceso_receso_min?: number;
  duracion_desayuno_min?: number;
  duracion_almuerzo_min?: number;
  regla_permitir_desayuno_tarde?: boolean;
  regla_permitir_almuerzo_tarde?: boolean;
  regla_solicitar_justificacion_receso?: boolean;
  regla_calcular_horas_extra?: boolean;
  regla_doble_marcaje?: boolean;
  permitir_marcaje_especial?: boolean;
  justificaciones_llegada_tarde?: string[];
  justificaciones_exceso_desayuno?: string[];
  justificaciones_exceso_almuerzo?: string[];
  justificaciones_salida_anticipada?: string[];
  justificaciones_marcaje_especial?: string[];
}

export interface PunchMetrics {
  minRetraso: number;
  minExcesoBreak: number;
  minExcesoAlm: number;
  minSalidaAnt: number;
  minExtra: number;
  tardanza_segundos: number;
  exceso_desayuno_segundos: number;
  exceso_almuerzo_segundos: number;
  salida_anticipada_segundos: number;
  horas_extra_segundos: number;
  estado_marcacion: MarcacionResultado | string;
  esDiaExtra: boolean;
}

export interface IntentOption {
  id: IntentChoice;
  label: string;
  evento: PunchEvent;
}

export interface EvaluatePunchInput {
  shift: ShiftLike | null | undefined;
  logs: TimeLogLike[] | null | undefined;
  policies: PoliciesLike | null | undefined;
  now?: Date;
  /** Evento forzado tras elegir intención en UI. */
  forcedEvent?: PunchEvent;
}

export interface EvaluatePunchResult {
  currentState: EngineState;
  nextState: EngineState;
  evento: PunchEvent | null;
  needsIntent: boolean;
  intentOptions: IntentOption[];
  intentPrompt: string | null;
  requiereJustificacion: boolean;
  justificacionTipo: string | null;
  justificacionOptions: string[];
  metrics: PunchMetrics;
  yaDesayuno: boolean;
  yaAlmorzo: boolean;
}
