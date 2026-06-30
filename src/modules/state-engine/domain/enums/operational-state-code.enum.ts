/**
 * Códigos de estado operativo (Motor 2 — snapshot de ubicación actual).
 *
 * Reflejan 1:1 los buckets que produce `derive_os_operational_state` en la
 * migración 035 (digital twin operational model). Cada OS vive en exactamente
 * uno de estos estados.
 */
export const OPERATIONAL_STATE_CODE = {
  PX_OPERATIVO: 'px_operativo',
  PENDIENTE_CLASIFICACION_CAC: 'pendiente_clasificacion_cac',
  PENDIENTE_INGRESO_BODEGA: 'pendiente_ingreso_bodega',
  BODEGA: 'bodega',
  TALLER: 'taller',
  DESPACHO: 'despacho',
  DESPACHADO: 'despachado',
  SCRAP: 'scrap',
  DEVUELTO: 'devuelto',
  OTRO: 'otro',
} as const;

export type OperationalStateCode =
  (typeof OPERATIONAL_STATE_CODE)[keyof typeof OPERATIONAL_STATE_CODE];

/** Etiqueta canónica por estado (alineada con `state_label` de la RPC). */
export const OPERATIONAL_STATE_LABELS: Record<OperationalStateCode, string> = {
  px_operativo: 'PX · pipeline',
  pendiente_clasificacion_cac: 'Pendiente clasificación CAC',
  pendiente_ingreso_bodega: 'Pendiente ingreso bodega',
  bodega: 'Bodega',
  taller: 'Taller',
  despacho: 'Despacho / listo salida',
  despachado: 'Despachado',
  scrap: 'Scrap / irreparable',
  devuelto: 'Devuelto',
  otro: 'Otro',
};

/**
 * Estados terminales: una OS que llega aquí ya salió del pipeline operativo y
 * no debería transicionar a otro estado distinto.
 */
export const TERMINAL_OPERATIONAL_STATES: readonly OperationalStateCode[] = [
  OPERATIONAL_STATE_CODE.DESPACHADO,
  OPERATIONAL_STATE_CODE.SCRAP,
  OPERATIONAL_STATE_CODE.DEVUELTO,
];

const ALL_CODES = new Set<string>(Object.values(OPERATIONAL_STATE_CODE));

export function isOperationalStateCode(value: unknown): value is OperationalStateCode {
  return typeof value === 'string' && ALL_CODES.has(value);
}
