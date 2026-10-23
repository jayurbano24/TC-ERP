export const ALL_HARVEST_DONORS = '__ALL_DONORS__';

export type HarvestAssignedLine = {
  donorSeriesId: string;
  catalogId: string;
  qty: number;
  notes?: string | null;
};

export function assignHarvestLinesToDonors(
  donorSeriesIds: string[],
  lines: HarvestAssignedLine[]
) {
  return donorSeriesIds.map((seriesId) => ({
    seriesId,
    lines: lines
      .filter((line) => line.donorSeriesId === ALL_HARVEST_DONORS || line.donorSeriesId === seriesId)
      .map(({ donorSeriesId, catalogId, qty, notes }) => ({
        catalogId,
        qty: donorSeriesId === ALL_HARVEST_DONORS ? 1 : qty,
        notes: notes ?? null,
      })),
  }));
}
