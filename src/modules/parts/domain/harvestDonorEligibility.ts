export function isScrapRack(rack: string | null | undefined): boolean {
  const normalized = String(rack ?? '').trim().toUpperCase();
  return normalized === 'SCRAP' || normalized === 'SCRAPS' || normalized.startsWith('SCRAP');
}

export function isEligibleHarvestDonor(
  status: string | null | undefined,
  rack: string | null | undefined
): boolean {
  return String(status ?? '').trim().toLowerCase() === 'irreparable' || isScrapRack(rack);
}
