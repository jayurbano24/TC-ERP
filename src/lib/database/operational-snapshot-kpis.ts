/**
 * KPI operativo Nivel 2 — solo estado actual (Motor 2 / current_status).
 * Movimiento del día solo en traslados y despachos.
 */

export type OperationalSnapshotKpis = {
  backoffice: {
    pendienteClasificar: number;
    pendienteIngresoBodega: number;
    devueltos: number;
    enValidacion: number;
  };
  bodega: {
    enColaIngreso: number;
    enBodega: number;
    trasladosPeriodo: number;
    despachosPeriodo: number;
  };
  taller: {
    enDiagnostico: number;
    enReparacion: number;
    enQC: number;
    listos: number;
  };
};

export const SNAPSHOT_KPI_FOOTNOTE =
  'Inventario operativo: estado actual por OS. No incluye histórico ni producción acumulada.';
