import { readPolicyMargins } from './PolicyEngine';
import type { PoliciesLike, PunchEvent, PunchMetrics } from './types';

const DEFAULTS = {
  llegada: ['Tráfico', 'Transporte público', 'Cita médica', 'Emergencia familiar', 'Otros'],
  desayuno: ['Atención a cliente', 'Reunión', 'Demora en servicio', 'Problema operativo', 'Otros'],
  almuerzo: ['Atención a cliente', 'Reunión', 'Demora en servicio', 'Problema operativo', 'Otros'],
  salida: ['Salud', 'Emergencia', 'Permiso autorizado', 'Comisión laboral', 'Otros'],
  especial: [
    'Reingreso a Laborar',
    'Trabajo Extraordinario',
    'Capacitación',
    'Emergencia',
    'Comisión Externa',
    'Otros',
  ],
};

export function resolveJustification(params: {
  evento: PunchEvent;
  metrics: PunchMetrics;
  policies: PoliciesLike | null | undefined;
}): { requiereJustificacion: boolean; justificacionTipo: string | null; justificacionOptions: string[] } {
  const { evento, metrics, policies } = params;
  const margins = readPolicyMargins(policies);

  if (evento === 'INGRESO' || evento === 'INGRESO_ESPECIAL') {
    if (metrics.tardanza_segundos > 0 || metrics.minRetraso > 0) {
      return {
        requiereJustificacion: true,
        justificacionTipo: 'LLEGADA_TARDE',
        justificacionOptions: policies?.justificaciones_llegada_tarde || DEFAULTS.llegada,
      };
    }
  }

  if (evento === 'DESAYUNO_FIN' && margins.pedirJustifReceso) {
    if (metrics.exceso_desayuno_segundos > 0 || metrics.minExcesoBreak > 0) {
      return {
        requiereJustificacion: true,
        justificacionTipo: 'EXCESO_DESAYUNO',
        justificacionOptions: policies?.justificaciones_exceso_desayuno || DEFAULTS.desayuno,
      };
    }
  }

  if (evento === 'ALMUERZO_FIN' && margins.pedirJustifReceso) {
    if (metrics.exceso_almuerzo_segundos > 0 || metrics.minExcesoAlm > 0) {
      return {
        requiereJustificacion: true,
        justificacionTipo: 'EXCESO_ALMUERZO',
        justificacionOptions: policies?.justificaciones_exceso_almuerzo || DEFAULTS.almuerzo,
      };
    }
  }

  if (evento === 'SALIDA_FINAL') {
    if (metrics.salida_anticipada_segundos > 0 || metrics.minSalidaAnt > 0) {
      return {
        requiereJustificacion: true,
        justificacionTipo: 'SALIDA_ANTICIPADA',
        justificacionOptions: policies?.justificaciones_salida_anticipada || DEFAULTS.salida,
      };
    }
  }

  if (evento === 'MARCAJE_ESPECIAL' || evento === 'INGRESO_ESPECIAL') {
    // Día extra / especial: siempre pedir motivo de catálogo especial
    if (metrics.esDiaExtra || evento === 'MARCAJE_ESPECIAL') {
      return {
        requiereJustificacion: true,
        justificacionTipo: 'MARCAJE_ESPECIAL',
        justificacionOptions: policies?.justificaciones_marcaje_especial || DEFAULTS.especial,
      };
    }
  }

  return { requiereJustificacion: false, justificacionTipo: null, justificacionOptions: [] };
}

export function specialMarcajeOptions(policies: PoliciesLike | null | undefined): string[] {
  return policies?.justificaciones_marcaje_especial || DEFAULTS.especial;
}
