import { describe, expect, it } from 'vitest';
import {
  pctOfActivas,
  SAP_DASHBOARD_STATES,
  isSapIntegrationStatus,
} from './sapDashboardStates';

describe('sapDashboardStates', () => {
  it('expone los 5 estados reales del dominio', () => {
    expect(SAP_DASHBOARD_STATES).toHaveLength(5);
    expect(SAP_DASHBOARD_STATES.map((s) => s.status)).toEqual([
      'Validado SAP',
      'Pendiente Validación',
      'Sin Coincidencia',
      'Pendiente Revisión',
      'Obsoleto',
    ]);
  });

  it('calcula % sobre OS activas', () => {
    expect(pctOfActivas(3031, 48058)).toBe(6);
    expect(pctOfActivas(0, 0)).toBe(0);
  });

  it('isSapIntegrationStatus valida estados conocidos', () => {
    expect(isSapIntegrationStatus('Validado SAP')).toBe(true);
    expect(isSapIntegrationStatus('2 materiales')).toBe(false);
  });
});
