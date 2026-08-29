import { describe, expect, it } from 'vitest';
import {
  filterDespachoHistoryGroups,
  groupDespachoHistory,
} from './groupDespachoHistory';
import type { DespachoHistoryRow } from './despachoReads';

function row(partial: Partial<DespachoHistoryRow> & { id: string }): DespachoHistoryRow & {
  series_numbers?: string[];
} {
  return {
    guide_number: 'NS-000004',
    dispatch_type: 'single_box',
    notes: 'PX: ZONA 3',
    dispatched_at: '2026-08-27T21:55:00Z',
    equipos_count: 9,
    ...partial,
  };
}

describe('groupDespachoHistory', () => {
  it('groups rows with the same guide_number into one', () => {
    const grouped = groupDespachoHistory([
      row({ id: 'a', box_code: 'OB-000001', series_numbers: ['SN111'] }),
      row({
        id: 'b',
        box_code: 'OB-000002',
        dispatched_at: '2026-08-27T21:55:06Z',
        series_numbers: ['SN222'],
      }),
      row({
        id: 'c',
        guide_number: 'NS-000005',
        box_code: 'OB-000010',
        equipos_count: 3,
        series_numbers: ['SN999'],
      }),
    ]);

    expect(grouped).toHaveLength(2);
    const ns4 = grouped.find((g) => g.guide_number === 'NS-000004')!;
    expect(ns4.memberIds).toEqual(expect.arrayContaining(['a', 'b']));
    expect(ns4.equipos_count).toBe(18);
    expect(ns4.box_codes).toEqual(expect.arrayContaining(['OB-000001', 'OB-000002']));
    expect(ns4.box_count).toBe(2);
    expect(ns4.series_numbers).toEqual(expect.arrayContaining(['SN111', 'SN222']));
  });

  it('keeps rows without guide_number as singleton groups', () => {
    const grouped = groupDespachoHistory([
      row({ id: 'x', guide_number: undefined, box_code: 'OB-1' }),
      row({ id: 'y', guide_number: undefined, box_code: 'OB-2' }),
    ]);
    expect(grouped).toHaveLength(2);
  });
});

describe('filterDespachoHistoryGroups', () => {
  const groups = groupDespachoHistory([
    row({
      id: 'a',
      box_code: 'OB-000032',
      series_numbers: ['48575443803E3CA8'],
    }),
    row({
      id: 'b',
      guide_number: 'NS-000099',
      box_code: 'OB-000100',
      series_numbers: ['OTHER'],
      notes: 'PX: ZONA 9',
    }),
  ]);

  it('filters by conduce number', () => {
    expect(filterDespachoHistoryGroups(groups, 'NS-000004')).toHaveLength(1);
    expect(filterDespachoHistoryGroups(groups, '4')).toHaveLength(1);
  });

  it('filters by box code', () => {
    expect(filterDespachoHistoryGroups(groups, 'OB-000032')).toHaveLength(1);
    expect(filterDespachoHistoryGroups(groups, '32')).toHaveLength(1);
  });

  it('filters by serial', () => {
    expect(filterDespachoHistoryGroups(groups, '48575443803E3CA8')).toHaveLength(1);
    expect(filterDespachoHistoryGroups(groups, '803e3ca8')).toHaveLength(1);
  });
});
