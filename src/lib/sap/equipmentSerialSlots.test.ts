import { describe, expect, it } from 'vitest';
import { buildEquipmentSerialSlots } from './equipmentSerialSlots';

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
});
