import { describe, expect, it } from 'vitest';
import {
  formatDigitsPerSeries,
  parseDigitsPerSeries,
} from './configCatalogCsv';
import { parseCsvText } from './workshopCatalogCsv';

describe('configCatalogCsv', () => {
  it('formatDigitsPerSeries joins with slash', () => {
    expect(formatDigitsPerSeries([12, 16])).toBe('12/16');
    expect(formatDigitsPerSeries([])).toBe('12');
  });

  it('parseDigitsPerSeries pads to seriesCount', () => {
    expect(parseDigitsPerSeries('12/16', 3)).toEqual([12, 16, 16]);
    expect(parseDigitsPerSeries('', 2)).toEqual([12, 12]);
  });

  it('technology csv roundtrip headers', () => {
    const rows = parseCsvText('nombre,cant_series,digitos\nONT,2,12/16');
    expect(rows[1]).toEqual(['ONT', '2', '12/16']);
    expect(parseDigitsPerSeries(rows[1][2], 2)).toEqual([12, 16]);
  });
});
