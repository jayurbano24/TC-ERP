import { describe, expect, it } from 'vitest';
import { ALL_HARVEST_DONORS, assignHarvestLinesToDonors } from './harvestLineAssignment';

describe('assignHarvestLinesToDonors', () => {
  it('aplica una linea masiva una vez a cada serie donante', () => {
    const result = assignHarvestLinesToDonors(['series-1', 'series-2'], [{ donorSeriesId: ALL_HARVEST_DONORS, catalogId: 'part-1', qty: 2, notes: 'Carcasa' }]);
    expect(result).toEqual([
      { seriesId: 'series-1', lines: [{ catalogId: 'part-1', qty: 1, notes: 'Carcasa' }] },
      { seriesId: 'series-2', lines: [{ catalogId: 'part-1', qty: 1, notes: 'Carcasa' }] },
    ]);
  });

  it('combina lineas masivas y especificas sin duplicarlas en otros donantes', () => {
    const result = assignHarvestLinesToDonors(['series-1', 'series-2'], [
      { donorSeriesId: ALL_HARVEST_DONORS, catalogId: 'part-all', qty: 2, notes: null },
      { donorSeriesId: 'series-1', catalogId: 'part-only-1', qty: 1, notes: null },
    ]);
    expect(result[0].lines).toHaveLength(2);
    expect(result[1].lines).toHaveLength(1);
  });
});
