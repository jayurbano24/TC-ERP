import type { AuditMetricEvent } from './types';

type AuditRow = {
  action: string;
  new_values?: { result?: string } | null;
};

/** Mapea una fila de erp_audit_logs a 0..N métricas KPI. */
export function classifyAuditMetrics(log: AuditRow): AuditMetricEvent[] {
  const result = log.new_values?.result;
  const events: AuditMetricEvent[] = [];

  switch (log.action) {
    case 'DIAGNÓSTICO INICIAL COMPLETADO':
      events.push({ proceso: 'taller', metrica: 'diagnosticos_completados' });
      break;
    case 'REPARACIÓN COMPLETADA':
      events.push({ proceso: 'taller', metrica: 'reparaciones_completadas' });
      break;
    case 'REACONDICIONADO COMPLETADO':
      events.push({ proceso: 'taller', metrica: 'reacondicionados_completados' });
      break;
    case 'CONTROL DE CALIDAD COMPLETADO':
      events.push({ proceso: 'taller', metrica: 'qc_completados' });
      if (result === 'rechazado_qc') {
        events.push({ proceso: 'taller', metrica: 'qc_rechazados' });
      } else {
        events.push({ proceso: 'taller', metrica: 'qc_aprobados' });
      }
      break;
    case 'DESPACHO CREADO':
      events.push({ proceso: 'despacho', metrica: 'despachos_creados' });
      break;
    case 'INGRESO BODEGA':
      events.push({ proceso: 'bodega', metrica: 'ingresos_bodega' });
      break;
    case 'TRASLADO BODEGA':
    case 'TRASLADO':
    case 'TRASLADO MASIVO A TALLER':
      events.push({ proceso: 'bodega', metrica: 'traslados_bodega' });
      break;
    default:
      break;
  }

  return events;
}

export const KPI_AUDIT_ACTIONS = [
  'DIAGNÓSTICO INICIAL COMPLETADO',
  'REPARACIÓN COMPLETADA',
  'REACONDICIONADO COMPLETADO',
  'CONTROL DE CALIDAD COMPLETADO',
  'DESPACHO CREADO',
  'INGRESO BODEGA',
  'TRASLADO BODEGA',
  'TRASLADO',
  'TRASLADO MASIVO A TALLER',
] as const;
