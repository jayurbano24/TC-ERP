import { describe, expect, it } from 'vitest';
import { orderSeriesForSapDisplay } from './inventorySeriesOrder';

describe('orderSeriesForSapDisplay', () => {
  it('coloca la serie Validada SAP en S1', () => {
    const ordered = orderSeriesForSapDisplay(
      [
        { serial_number: 'BBBB', sap_status: 'Pendiente', created_at: '2026-01-01' },
        { serial_number: 'AAAA', sap_status: 'Validado SAP', created_at: '2026-01-02' },
        { serial_number: 'CCCC', sap_status: 'Sin Coincidencia', created_at: '2026-01-03' },
      ],
      'BBBB',
    );
    expect(ordered.map((r) => r.serial_number)).toEqual(['AAAA', 'BBBB', 'CCCC']);
  });

  it('usa main_serial como desempate cuando no hay validada SAP', () => {
    const ordered = orderSeriesForSapDisplay(
      [
        { serial_number: 'S2X', sap_status: 'Pendiente', created_at: '2026-01-01' },
        { serial_number: 'MAIN1', sap_status: 'Pendiente', created_at: '2026-01-02' },
      ],
      'MAIN1',
    );
    expect(ordered[0]?.serial_number).toBe('MAIN1');
  });
});
