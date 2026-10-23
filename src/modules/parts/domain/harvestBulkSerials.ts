const MAX_HARVEST_BULK_SERIALS = 100;

export function parseHarvestBulkSerials(value: string): string[] {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const token of value.split(/[\s,;]+/)) {
    const serial = token.trim().toUpperCase();
    if (!serial || seen.has(serial)) continue;
    seen.add(serial);
    unique.push(serial);
  }
  if (unique.length > MAX_HARVEST_BULK_SERIALS) {
    throw new Error(`MÃ¡ximo ${MAX_HARVEST_BULK_SERIALS} series por lote.`);
  }
  return unique;
}
