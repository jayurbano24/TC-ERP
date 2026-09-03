import { describe, expect, it } from 'vitest';
import { buildEquipmentSerialSlots, pickSapPrimarySerial } from './equipmentSerialSlots';

describe('buildEquipmentSerialSlots', () => {
  it('coloca SN SAP en S1 y MACs en S2–S4', () => {
    const group = [
      {
        id: '1',
        serial_number: '70DFF79E39A1',
        created_at: '2026-01-01',
      },
      {
        id: '2',
        serial_number: '2414NJ9EC800979',
        material: '4013897',
        valuation: 'VALORADO',
        created_at: '2026-01-02',
      },
      {
        id: '3',
        serial_number: '70DFF79E39A0',
        created_at: '2026-01-03',
      },
      {
        id: '4',
        serial_number: '70DFF79E39A2',
        created_at: '2026-01-04',
      },
    ];
    const slots = buildEquipmentSerialSlots(group, '2414NJ9EC800979');
    expect(slots.s1).toBe('2414NJ9EC800979');
    expect(slots.s2).toBe('70DFF79E39A1');
    expect(slots.s3).toBe('70DFF79E39A0');
    expect(slots.s4).toBe('70DFF79E39A2');
  });

  it('no pone MAC en S1 aunque main_serial sea MAC', () => {
    const group = [
      { id: '1', serial_number: '50A5DC103354', created_at: '2026-01-01' },
      {
        id: '2',
        serial_number: 'ZTEATV41203334175',
        material: '4015902',
        valuation: 'NOVALORADO',
        sap_status: 'Validado',
        created_at: '2026-01-02',
      },
      { id: '3', serial_number: '50A5DC103355', created_at: '2026-01-03' },
    ];
    const slots = buildEquipmentSerialSlots(group, '50A5DC103354');
    expect(slots.s1).toBe('ZTEATV41203334175');
    expect(slots.s2).toMatch(/^50A5DC/);
  });

  it('pickSapPrimarySerial prefiere Validado + material sobre MAC', () => {
    const primary = pickSapPrimarySerial(
      [
        { id: 'm', serial_number: '70DFF7A245AE' },
        {
          id: 's',
          serial_number: 'ZTEATV41203482571',
          material: '4015902',
          sap_status: 'Validado',
        },
      ],
      '70DFF7A245AE'
    );
    expect(primary.serial_number).toBe('ZTEATV41203482571');
  });
});
