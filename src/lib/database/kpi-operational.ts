import {
  type OperationalSnapshotKpis,
  SNAPSHOT_KPI_FOOTNOTE,
} from '@/lib/database/operational-snapshot-kpis';

export type OperationalKpiRow = {
  id: string;
  label: string;
  meta: number | null;
  real: number | null;
  pendientes: number | null;
  cumplimientoPct: number | null;
  tatHoras: number | null;
  tatMetaHoras: number | null;
  detalle?: string;
};

export type OperationalAreaPayload = {
  id: string;
  label: string;
  icon: string;
  rows: OperationalKpiRow[];
  variant?: 'flow' | 'wip' | 'quality';
  columnLabels?: {
    real?: string;
    pendientes?: string;
  };
  footnote?: string;
};

export type OperationalKpiPayload = {
  timeRange: string;
  areas: OperationalAreaPayload[];
};

function row(
  id: string,
  label: string,
  real: number | null,
  opts?: { detalle?: string; pendientes?: number | null }
): OperationalKpiRow {
  return {
    id,
    label,
    meta: null,
    real,
    pendientes: opts?.pendientes ?? null,
    cumplimientoPct: null,
    tatHoras: null,
    tatMetaHoras: null,
    detalle: opts?.detalle,
  };
}

export function buildOperationalKpi(params: {
  timeRange: string;
  recepcion?: {
    equiposRecibidos: number;
    cajasRecibidas: number;
    origenCac: number;
    origenPx: number;
    equiposPorCaja: number | null;
  };
  snapshot: OperationalSnapshotKpis;
}): OperationalKpiPayload {
  const { timeRange, recepcion, snapshot } = params;
  const snapNote = 'Estado actual · Motor 2 / current_status';

  const areas: OperationalAreaPayload[] = [];

  if (recepcion) {
    areas.push({
      id: 'recepcion',
      label: 'Recepción',
      icon: 'package',
      variant: 'flow',
      footnote: `Movimiento del periodo: ${timeRange}`,
      rows: [
        row('ingresados', `Equipos recibidos (${timeRange})`, recepcion.equiposRecibidos, {
          detalle: 'Periodo seleccionado',
        }),
        row('cajas', 'Cajas recibidas', recepcion.cajasRecibidas),
        row('cac', 'Canal CAC', recepcion.origenCac),
        row('px', 'Canal PX', recepcion.origenPx),
        row(
          'por_caja',
          'Equipos por caja (prom.)',
          recepcion.equiposPorCaja,
          { detalle: recepcion.equiposPorCaja !== null ? 'Promedio periodo' : 'Sin datos' }
        ),
      ],
    });
  }

  areas.push(
    {
      id: 'backoffice',
      label: 'Backoffice',
      icon: 'users',
      variant: 'wip',
      columnLabels: { real: 'Ahora' },
      footnote: SNAPSHOT_KPI_FOOTNOTE,
      rows: [
        row('pendiente_clasificar', 'Pendiente clasificar', snapshot.backoffice.pendienteClasificar, {
          detalle: `${snapNote} · pendiente_clasificacion_cac`,
        }),
        row('pendiente_ingreso', 'Pendiente ingreso bodega', snapshot.backoffice.pendienteIngresoBodega, {
          detalle: `${snapNote} · pendiente_ingreso_bodega`,
        }),
        row('devueltos', 'Devueltos', snapshot.backoffice.devueltos, {
          detalle: `${snapNote} · devuelto`,
        }),
        row('en_validacion', 'En validación', snapshot.backoffice.enValidacion, {
          detalle: `${snapNote} · in_validation`,
        }),
      ],
    },
    {
      id: 'bodega',
      label: 'Bodega',
      icon: 'warehouse',
      variant: 'wip',
      columnLabels: { real: 'Ahora' },
      footnote: `${SNAPSHOT_KPI_FOOTNOTE} Traslados y despachos = movimiento ${timeRange}.`,
      rows: [
        row('cola_ingreso', 'En cola ingreso', snapshot.bodega.enColaIngreso, {
          detalle: snapNote,
        }),
        row('en_bodega', 'En bodega', snapshot.bodega.enBodega, {
          detalle: `${snapNote} · in_central_warehouse / in_control_warehouse`,
        }),
        row('traslados', 'Traslados', snapshot.bodega.trasladosPeriodo, {
          detalle: `Movimiento ${timeRange}`,
        }),
        row('despachos', 'Despachos', snapshot.bodega.despachosPeriodo, {
          detalle: `Movimiento ${timeRange}`,
        }),
      ],
    },
    {
      id: 'taller',
      label: 'Taller',
      icon: 'wrench',
      variant: 'wip',
      columnLabels: { real: 'Ahora' },
      footnote: SNAPSHOT_KPI_FOOTNOTE,
      rows: [
        row('diagnostico', 'En diagnóstico', snapshot.taller.enDiagnostico, {
          detalle: `${snapNote} · in_workshop`,
        }),
        row('reparacion', 'En reparación', snapshot.taller.enReparacion, {
          detalle: `${snapNote} · in_qc`,
        }),
        row('qc', 'En QC', snapshot.taller.enQC, {
          detalle: `${snapNote} · in_validation`,
        }),
        row('listos', 'Listos', snapshot.taller.listos, {
          detalle: `${snapNote} · ready_to_dispatch`,
        }),
      ],
    }
  );

  return { timeRange, areas };
}
// Re-export footnote for consumers
export { SNAPSHOT_KPI_FOOTNOTE };

