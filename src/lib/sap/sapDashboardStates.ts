import type { SapValidationState } from '@/modules/sap-integration/domain/sap-validation-status';

export type SapDashboardKpiKey =
  | 'validados'
  | 'pendientes'
  | 'sinCoincidencia'
  | 'inconsistentes'
  | 'obsoletos';

export type SapDashboardStateConfig = {
  status: SapValidationState;
  kpiKey: SapDashboardKpiKey;
  title: string;
  description: string;
  accent: 'success' | 'warning' | 'danger' | 'muted';
};

/** Orden fijo en dashboard — los 5 estados reales del dominio SAP. */
export const SAP_DASHBOARD_STATES: SapDashboardStateConfig[] = [
  {
    status: 'Validado SAP',
    kpiKey: 'validados',
    title: 'Validado SAP',
    description: 'OS en planta cruzadas contra G985 con material consistente.',
    accent: 'success',
  },
  {
    status: 'Pendiente Validación',
    kpiKey: 'pendientes',
    title: 'Pendiente Validación',
    description: 'OS en planta con serie que aún no cruzaron contra un G985.',
    accent: 'warning',
  },
  {
    status: 'Sin Coincidencia',
    kpiKey: 'sinCoincidencia',
    title: 'Sin Coincidencia',
    description: 'OS en planta con serie, ausentes del SAP validado.',
    accent: 'danger',
  },
  {
    status: 'Pendiente Revisión',
    kpiKey: 'inconsistentes',
    title: 'Pendiente Revisión',
    description: 'OS en planta con 2+ materiales distintos en el G985.',
    accent: 'warning',
  },
  {
    status: 'Obsoleto',
    kpiKey: 'obsoletos',
    title: 'Obsoleto',
    description: 'OS en planta marcadas obsoletas.',
    accent: 'muted',
  },
];

export function pctOfActivas(count: number, activas: number): number {
  if (!activas || activas <= 0) return 0;
  return Math.round((count / activas) * 100);
}

export function isSapIntegrationStatus(value: string): value is SapValidationState {
  return SAP_DASHBOARD_STATES.some((s) => s.status === value);
}
