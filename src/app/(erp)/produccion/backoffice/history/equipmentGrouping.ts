export function orderUnitSeries(unitSeries: any[]): any[] {
  if (!unitSeries.length) return [];
  const os = unitSeries.find((s) => s?.service_orders)?.service_orders;
  const mainSerial = String(os?.main_serial || '').trim().toUpperCase();

  return [...unitSeries].sort((a, b) => {
    const aSn = String(a.serial_number || '').toUpperCase();
    const bSn = String(b.serial_number || '').toUpperCase();
    if (mainSerial) {
      if (aSn === mainSerial && bSn !== mainSerial) return -1;
      if (bSn === mainSerial && aSn !== mainSerial) return 1;
    }
    const ta = new Date(a.created_at || a.updated_at || 0).getTime();
    const tb = new Date(b.created_at || b.updated_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    return aSn.localeCompare(bSn);
  });
}

/** Agrupa series por OS (service_order_id) — una fila = un equipo real */
export function groupSeriesIntoEquipmentUnits(
  series: any[],
  resolveSeriesPerUnit: (modelId: string) => number = () => 1
): { modelId: string; brandId: string; unit: any[] }[] {
  const byOs = new Map<string, any[]>();
  const withoutOs: any[] = [];

  for (const s of series) {
    if (!s.brand_id) continue;
    const osId = s.service_order_id;
    if (osId) {
      if (!byOs.has(osId)) byOs.set(osId, []);
      byOs.get(osId)!.push(s);
    } else {
      withoutOs.push(s);
    }
  }

  const units: { modelId: string; brandId: string; unit: any[] }[] = [];

  for (const raw of byOs.values()) {
    const unit = orderUnitSeries(raw);
    units.push({
      modelId: unit[0]?.model_id || '',
      brandId: unit[0]?.brand_id || '',
      unit,
    });
  }

  // Legacy: series sin OS — fallback por modelo (datos antiguos)
  if (withoutOs.length > 0) {
    for (const legacyGroup of groupSeriesByModelBrand(withoutOs)) {
      const seriesPerUnit = Math.max(1, resolveSeriesPerUnit(legacyGroup.modelId) || 1);
      for (let i = 0; i < legacyGroup.fullSeries.length; i += seriesPerUnit) {
        units.push({
          modelId: legacyGroup.modelId,
          brandId: legacyGroup.brandId,
          unit: legacyGroup.fullSeries.slice(i, i + seriesPerUnit),
        });
      }
    }
  }

  return units;
}

/** Solo para datos legacy sin service_order_id */
export function groupSeriesByModelBrand(series: any[]) {
  const groups = new Map<string, { modelId: string; brandId: string; fullSeries: any[] }>();
  for (const s of series) {
    if (!s.brand_id) continue;
    const key = (s.model_id || '') + '|' + (s.brand_id || '');
    if (!groups.has(key)) groups.set(key, { modelId: s.model_id, brandId: s.brand_id, fullSeries: [] });
    groups.get(key)!.fullSeries.push(s);
  }
  return Array.from(groups.values());
}

/** @deprecated Usar groupSeriesIntoEquipmentUnits */
export function groupSeriesByEquipment(series: any[]) {
  return groupSeriesByModelBrand(series);
}

/** Unidades con todas las series requeridas por línea de manifiesto */
export function countReadyEquipmentUnits(guideItems: { cantidad: number; seriesPerUnit: number; series: string[][] }[]): number {
  return guideItems.reduce((sum, item) => {
    return (
      sum +
      item.series.filter(
        (u) => Array.isArray(u) && u.length >= item.seriesPerUnit && String(u[0] || '').trim()
      ).length
    );
  }, 0);
}
