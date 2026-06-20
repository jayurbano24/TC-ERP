export type PxEquipmentRow = {
  sn: string;
  s2?: string;
  s3?: string;
  s4?: string;
  service_order_id?: string;
  current_box_id?: string;
  boxCode?: string;
  material?: string;
};

type SeriesRow = {
  serial_number: string;
  service_order_id?: string | null;
  current_box_id?: string | null;
  material?: string | null;
};

type ServiceOrderRow = {
  id: string;
  main_serial: string;
};

/** Agrupa filas de `series` (1 fila por SN interno) en equipos con sn/s2/s3/s4. */
export function groupPxSeriesByEquipment(
  seriesRows: SeriesRow[],
  serviceOrders: ServiceOrderRow[] = [],
  boxCodeById?: Record<string, string>
): PxEquipmentRow[] {
  const mainByOs = new Map(serviceOrders.map((os) => [os.id, os.main_serial.trim().toUpperCase()]));
  const serialsByOs = new Map<string, string[]>();

  for (const row of seriesRows) {
    const osId = row.service_order_id;
    if (!osId) continue;
    const list = serialsByOs.get(osId) || [];
    list.push(row.serial_number.trim().toUpperCase());
    serialsByOs.set(osId, list);
  }

  const equipments: PxEquipmentRow[] = [];

  for (const [osId, serials] of serialsByOs) {
    const unique = [...new Set(serials)];
    const main = mainByOs.get(osId);
    const ordered = main && unique.includes(main)
      ? [main, ...unique.filter((s) => s !== main)]
      : unique;

    const sample = seriesRows.find((r) => r.service_order_id === osId);
    const boxId = sample?.current_box_id || undefined;

    equipments.push({
      service_order_id: osId,
      sn: ordered[0] || '',
      s2: ordered[1],
      s3: ordered[2],
      s4: ordered[3],
      current_box_id: boxId,
      boxCode: boxId && boxCodeById ? boxCodeById[boxId] : undefined,
      material: sample?.material || undefined,
    });
  }

  return equipments.sort((a, b) => a.sn.localeCompare(b.sn));
}
