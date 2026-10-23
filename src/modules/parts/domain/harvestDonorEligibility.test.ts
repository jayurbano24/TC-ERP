import { describe, expect, it } from 'vitest';
import { isEligibleHarvestDonor } from './harvestDonorEligibility';

describe('isEligibleHarvestDonor', () => {
  it('acepta el estado real usado por Taller SCRAPS', () => {
    expect(isEligibleHarvestDonor('irreparable', null)).toBe(true);
  });

  it('acepta una serie ya ubicada en una caja SCRAP', () => {
    expect(isEligibleHarvestDonor('in_workshop', 'SCRAP')).toBe(true);
  });

  it('rechaza equipos vigentes fuera de SCRAP', () => {
    expect(isEligibleHarvestDonor('in_workshop', null)).toBe(false);
  });
});
