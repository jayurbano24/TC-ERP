/**
 * Dominio de validación SAP (lógica pura, sin acceso a datos).
 *
 * Fuente única de verdad para el estado de validación SAP de una unidad y para
 * la matriz de bloqueos operativos (despacho / traslado). El acceso desde UI,
 * API y otros módulos debe hacerse vía el port `ISapValidationReader`
 * (`@/modules/sap-integration`). `@/lib/sap/sapValidationStatus` re-exporta este
 * módulo por compatibilidad con consumidores existentes.
 */

export type SapValidationState =
  | 'Validado SAP'
  | 'Pendiente Validación'
  | 'Sin Coincidencia'
  | 'Pendiente Revisión'
  | 'Obsoleto';

export type SapStatusMeta = {
  label: string;
  shortLabel: string;
  className: string;
  canDispatch: boolean;
  canTransfer: boolean;
};

const INTEGRATION_MAP: Record<string, SapValidationState> = {
  'validado sap': 'Validado SAP',
  validado: 'Validado SAP',
  'pendiente validación': 'Pendiente Validación',
  'pendiente validacion': 'Pendiente Validación',
  pendiente: 'Pendiente Validación',
  'sin coincidencia': 'Sin Coincidencia',
  'pendiente revisión': 'Pendiente Revisión',
  'pendiente revision': 'Pendiente Revisión',
  revisar: 'Pendiente Revisión',
  obsoleto: 'Obsoleto',
};

export function normalizeSapIntegrationStatus(raw?: string | null): SapValidationState {
  const key = (raw || '').trim().toLowerCase();
  if (!key) return 'Pendiente Validación';
  return INTEGRATION_MAP[key] || 'Pendiente Validación';
}

export function normalizeSeriesSapStatus(raw?: string | null): SapValidationState {
  const key = (raw || 'pendiente').trim().toLowerCase();
  if (key === 'validado') return 'Validado SAP';
  return INTEGRATION_MAP[key] || 'Pendiente Validación';
}

/** Estado SAP del equipo (OS) considerando integración + series S1–S4. */
export function resolveUnitSapStatus(
  integrationStatus?: string | null,
  seriesStatuses?: (string | null | undefined)[]
): SapValidationState {
  const equipo = normalizeSapIntegrationStatus(integrationStatus);
  if (equipo === 'Pendiente Revisión' || equipo === 'Sin Coincidencia' || equipo === 'Obsoleto') {
    return equipo;
  }
  if (equipo === 'Validado SAP') return 'Validado SAP';

  const normalizedSeries = (seriesStatuses || [])
    .filter(Boolean)
    .map((s) => normalizeSeriesSapStatus(s));

  if (normalizedSeries.length === 0) return equipo;
  if (normalizedSeries.some((s) => s === 'Sin Coincidencia')) return 'Sin Coincidencia';
  if (normalizedSeries.every((s) => s === 'Validado SAP')) return 'Validado SAP';
  if (normalizedSeries.some((s) => s === 'Validado SAP')) return 'Pendiente Revisión';
  return equipo;
}

export function getSapStatusMeta(status: SapValidationState): SapStatusMeta {
  switch (status) {
    case 'Validado SAP':
      return {
        label: 'Validado SAP',
        shortLabel: 'OK',
        className: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
        canDispatch: true,
        canTransfer: true,
      };
    case 'Sin Coincidencia':
      return {
        label: 'Sin Coincidencia',
        shortLabel: 'NO',
        className: 'bg-rose-50 text-rose-700 border border-rose-100',
        canDispatch: false,
        canTransfer: false,
      };
    case 'Pendiente Revisión':
      return {
        label: 'Pendiente Revisión',
        shortLabel: 'REV',
        className: 'bg-orange-50 text-orange-700 border border-orange-100',
        canDispatch: false,
        canTransfer: false,
      };
    case 'Obsoleto':
      return {
        label: 'Obsoleto',
        shortLabel: 'OBS',
        className: 'bg-slate-100 text-slate-600 border border-slate-200',
        canDispatch: false,
        canTransfer: false,
      };
    default:
      return {
        label: 'Pendiente Validación',
        shortLabel: 'PEN',
        className: 'bg-amber-50 text-amber-700 border border-amber-100',
        canDispatch: false,
        canTransfer: true,
      };
  }
}

export function assertSapOperationAllowed(
  status: SapValidationState,
  operation: 'dispatch' | 'transfer'
): { ok: true } | { ok: false; message: string } {
  const meta = getSapStatusMeta(status);
  const allowed = operation === 'dispatch' ? meta.canDispatch : meta.canTransfer;
  if (allowed) return { ok: true };
  const action = operation === 'dispatch' ? 'despachar' : 'trasladar';
  return {
    ok: false,
    message: `Bloqueo Integración SAP: no se puede ${action} — estado "${meta.label}".`,
  };
}
