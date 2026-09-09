export function isSapValidatedSeriesStatus(status?: string | null): boolean {
  const key = String(status || '').trim().toLowerCase();
  return key === 'validado' || key === 'validado sap';
}

/** S1 = serie Validada SAP; luego main_serial; luego fecha de creación. */
export function orderSeriesForSapDisplay(
  rows: ReadonlyArray<{ serial_number?: string | null; sap_status?: string | null; created_at?: string | null }>,
  mainSerial?: string | null,
): Array<{ serial_number?: string | null; sap_status?: string | null; created_at?: string | null }> {
  const main = String(mainSerial || '')
    .trim()
    .toUpperCase();
  return [...rows].sort((a, b) => {
    const aOk = isSapValidatedSeriesStatus(a.sap_status) ? 0 : 1;
    const bOk = isSapValidatedSeriesStatus(b.sap_status) ? 0 : 1;
    if (aOk !== bOk) return aOk - bOk;
    if (main) {
      const aSn = String(a.serial_number || '').toUpperCase();
      const bSn = String(b.serial_number || '').toUpperCase();
      if (aSn === main && bSn !== main) return -1;
      if (bSn === main && aSn !== main) return 1;
    }
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    return String(a.serial_number || '').localeCompare(String(b.serial_number || ''));
  });
}

export function isScrapInventoryAnchorRow(row: {
  current_status?: string | null;
  boxes?: { rack_location?: string | null } | null;
}): boolean {
  if (row.current_status !== 'irreparable') return false;
  const rack = String(row.boxes?.rack_location || '').toUpperCase();
  return rack === 'SCRAP' || rack === 'SCRAPS' || rack.startsWith('SCRAP');
}
