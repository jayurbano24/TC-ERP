export type HarvestCaseLine = { catalogId: string; qty: number; notes?: string | null };
export type HarvestCaseDonor = { seriesId: string; lines: HarvestCaseLine[] };

export function validateHarvestCaseInput(
  donors: HarvestCaseDonor[]
): { ok: true } | { ok: false; error: 'NO_DONORS' | 'DUPLICATE_DONOR' | 'DONOR_WITHOUT_LINES' | 'INVALID_LINE' | 'PART_QUANTITY_EXCEEDED' | 'DUPLICATE_PART' } {
  if (!donors.length) return { ok: false, error: 'NO_DONORS' };
  const ids = new Set<string>();
  for (const donor of donors) {
    if (ids.has(donor.seriesId)) return { ok: false, error: 'DUPLICATE_DONOR' };
    ids.add(donor.seriesId);
    if (!donor.lines.length) return { ok: false, error: 'DONOR_WITHOUT_LINES' };
    const catalogIds = new Set<string>();
    for (const line of donor.lines) {
      if (line.qty > 1) return { ok: false, error: 'PART_QUANTITY_EXCEEDED' };
      if (catalogIds.has(line.catalogId)) return { ok: false, error: 'DUPLICATE_PART' };
      catalogIds.add(line.catalogId);
    }
    if (donor.lines.some((line) => !line.catalogId || !Number.isInteger(line.qty) || line.qty <= 0)) {
      return { ok: false, error: 'INVALID_LINE' };
    }
  }
  return { ok: true };
}
