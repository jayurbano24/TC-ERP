/**
 * Presentación legible de old_values / new_values en Detalle de Auditoría (Seguridad).
 * No cambia el payload persistido; solo etiqueta para UI.
 */

const KEY_LABELS: Record<string, string> = {
  result: 'Resultado',
  notes: 'Notas',
  nextStatus: 'Derivado a',
  next_status: 'Derivado a',
  operator_name: 'Operador',
  registered_by: 'Registrado por',
  requested_series: 'Series solicitadas',
  expanded_series: 'Series procesadas',
  items: 'Fallas / ítems',
  repairs: 'Reparaciones',
  observations: 'Observaciones',
  comment: 'Comentario',
  reason: 'Motivo',
  status: 'Estado',
  box: 'Caja',
  box_id: 'ID de caja',
  sap_transfer_id: 'Transferencia SAP',
  reception_id: 'Recepción',
  service_order_id: 'Orden de servicio',
  source: 'Origen',
};

const RESULT_LABELS: Record<string, string> = {
  reparacion: 'Reparación (L1/L2)',
  reacondicionado: 'Reacondicionado',
  l3: 'Falla mayor (L3)',
  scraps: 'Scrap / Desecho',
  control_calidad: 'Control de calidad (QC)',
  listo: 'Aceptado / Listo',
  rechazado_qc: 'Rechazado en QC',
};

const STATUS_LABELS: Record<string, string> = {
  in_workshop: 'Diagnóstico',
  in_qc: 'Reparación',
  in_validation: 'Control de calidad',
  in_control_warehouse: 'L3 / Bodega control',
  in_refurbish: 'Reacondicionado',
  ready_to_dispatch: 'Listo para despacho',
  scrapped: 'Scrap',
  irreparable: 'Irreparable',
  in_central_warehouse: 'Equipo listo / Bodega',
  in_dispatch_warehouse: 'Bodega Despacho / Outbound',
  RECEPCIONADO_BODEGA_GENERAL: 'Backoffice',
};

export type AuditDiffEntry = {
  key: string;
  label: string;
  value: string;
  /** true si el valor original estaba vacío (no mostrar o mostrar aviso). */
  empty: boolean;
};

function isEmptyValue(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (Array.isArray(v) && v.length === 0) return true;
  if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) {
    return true;
  }
  return false;
}

function humanizeToken(raw: string): string {
  const key = raw.trim();
  if (!key) return '—';
  if (RESULT_LABELS[key]) return RESULT_LABELS[key];
  if (STATUS_LABELS[key]) return STATUS_LABELS[key];
  return key.replace(/_/g, ' ');
}

function formatValue(key: string, v: unknown): string {
  if (isEmptyValue(v)) return '—';

  if (key === 'result' && typeof v === 'string') {
    return RESULT_LABELS[v] || humanizeToken(v);
  }
  if ((key === 'nextStatus' || key === 'next_status' || key === 'status') && typeof v === 'string') {
    return STATUS_LABELS[v] || humanizeToken(v);
  }
  if (Array.isArray(v)) {
    return v.map((item) => (typeof item === 'string' ? humanizeToken(item) : JSON.stringify(item))).join(', ');
  }
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  }
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'string') {
    // Notas largas: conservar texto; códigos cortos: humanizar
    if (v.length <= 48 && /^[a-z0-9_]+$/i.test(v)) return humanizeToken(v);
    return v;
  }
  return String(v);
}

function labelForKey(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Convierte un objeto de auditoría en filas etiquetadas para UI.
 * Omite claves vacías (p. ej. items: []) para no mostrar ruido.
 */
export function formatAuditDiffEntries(
  values: Record<string, unknown> | null | undefined
): AuditDiffEntry[] {
  if (!values || typeof values !== 'object') return [];

  return Object.entries(values)
    .map(([key, raw]) => {
      const empty = isEmptyValue(raw);
      return {
        key,
        label: labelForKey(key),
        value: formatValue(key, raw),
        empty,
      };
    })
    .filter((e) => !e.empty);
}
