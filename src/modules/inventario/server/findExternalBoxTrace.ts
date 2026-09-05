import type { SupabaseClient } from '@supabase/supabase-js';
import {
  boxSeriesStatusLabel,
  classifyExternalBoxOutcome,
  describeBoxLocation,
  describeBoxTraceDetail,
  type BoxTraceStatusCount,
  type ExternalBoxTrace,
} from '../domain/boxLocationTrace';

type BoxRow = {
  id: string;
  box_code: string | null;
  rack_location: string | null;
};

type SeriesRow = {
  service_order_id: string | null;
  current_status: string | null;
  current_box_id: string | null;
};

type BoxLabelRow = {
  id: string;
  box_code: string | null;
  rack_location: string | null;
};

type MovementRow = {
  movement_type: string | null;
  target_module: string | null;
  target_location: string | null;
  performed_by_name: string | null;
  guide_number: string | null;
  reference_doc: string | null;
  reason: string | null;
  created_at: string | null;
};

type DispatchRow = {
  guide_number: string | null;
  notes: string | null;
  dispatched_at: string | null;
};

/** Ubicación física real: el estado por sí solo no dice en qué caja quedó la serie. */
function describeUnitLocation(box: BoxLabelRow | undefined, sourceBoxId: string): string {
  if (!box || box.id === sourceBoxId) return 'sin caja asignada';
  const code = box.box_code || box.id;
  const rack = box.rack_location?.trim().toUpperCase() ?? '';
  if (rack === 'OUTBOUND' || rack === 'DESPACHO') return `Outbound ${code}`;
  if (rack === 'ELIMINADO') return `${code} (fuera de Bodega)`;
  return rack ? `${code} · ${rack}` : code;
}

function aggregateStatuses(
  rows: SeriesRow[],
  sourceBoxId: string,
  boxById: Map<string, BoxLabelRow>,
): BoxTraceStatusCount[] {
  const unitByKey = new Map<string, SeriesRow>();
  rows.forEach((row, index) => {
    const unitId = row.service_order_id || `series-${index}`;
    if (!unitByKey.has(unitId)) unitByKey.set(unitId, row);
  });

  const grouped = new Map<string, { count: number; locations: Set<string> }>();
  unitByKey.forEach((row) => {
    const status = row.current_status || 'sin_estado';
    const entry = grouped.get(status) ?? { count: 0, locations: new Set<string>() };
    entry.count += 1;
    entry.locations.add(
      describeUnitLocation(
        row.current_box_id ? boxById.get(row.current_box_id) : undefined,
        sourceBoxId,
      ),
    );
    grouped.set(status, entry);
  });

  return [...grouped.entries()]
    .map(([status, entry]) => ({
      status,
      label: boxSeriesStatusLabel(status),
      count: entry.count,
      locations: [...entry.locations].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

async function fetchBoxLabels(
  db: SupabaseClient,
  boxIds: string[],
): Promise<Map<string, BoxLabelRow>> {
  const map = new Map<string, BoxLabelRow>();
  for (let offset = 0; offset < boxIds.length; offset += 80) {
    const chunk = boxIds.slice(offset, offset + 80);
    const { data, error } = await db
      .from('boxes')
      .select('id, box_code, rack_location')
      .in('id', chunk);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as BoxLabelRow[]) map.set(String(row.id), row);
  }
  return map;
}

async function findHistoricalSeries(
  db: SupabaseClient,
  boxId: string,
): Promise<SeriesRow[]> {
  const { data: directRows, error: directError } = await db
    .from('series')
    .select('service_order_id, current_status, current_box_id')
    .eq('current_box_id', boxId)
    .limit(2000);
  if (directError) throw new Error(directError.message);
  if ((directRows ?? []).length > 0) return directRows as SeriesRow[];

  const { data: equipmentRows, error: equipmentError } = await db
    .from('px_reception_equipment')
    .select('promoted_service_order_id')
    .eq('box_id', boxId)
    .not('promoted_service_order_id', 'is', null)
    .limit(2000);
  if (equipmentError) throw new Error(equipmentError.message);

  const orderIds = [
    ...new Set(
      (equipmentRows ?? [])
        .map((row) => row.promoted_service_order_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  if (orderIds.length === 0) return [];

  const rows: SeriesRow[] = [];
  for (let offset = 0; offset < orderIds.length; offset += 80) {
    const chunk = orderIds.slice(offset, offset + 80);
    const { data, error } = await db
      .from('series')
      .select('service_order_id, current_status, current_box_id')
      .in('service_order_id', chunk)
      .limit(4000);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as SeriesRow[]));
  }
  return rows;
}

export async function findExternalBoxTrace(
  db: SupabaseClient,
  box: BoxRow,
): Promise<ExternalBoxTrace> {
  const [movementResult, dispatchResult, deletionResult, historicalSeries] = await Promise.all([
    db
      .from('warehouse_movements')
      .select(
        'movement_type, target_module, target_location, performed_by_name, guide_number, reference_doc, reason, created_at',
      )
      .eq('box_id', box.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('dispatches')
      .select('guide_number, notes, dispatched_at')
      .eq('box_id', box.id)
      .order('dispatched_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('box_deletion_requests')
      .select('id')
      .eq('box_id', box.id)
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle(),
    findHistoricalSeries(db, box.id),
  ]);

  if (movementResult.error) throw new Error(movementResult.error.message);
  if (dispatchResult.error) throw new Error(dispatchResult.error.message);
  if (deletionResult.error) throw new Error(deletionResult.error.message);

  const movement = (movementResult.data ?? null) as MovementRow | null;
  const dispatch = (dispatchResult.data ?? null) as DispatchRow | null;
  const dispatchReference = dispatch?.guide_number ?? null;
  const relatedBoxIds = [
    ...new Set(
      historicalSeries
        .map((row) => row.current_box_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0 && id !== box.id),
    ),
  ];
  const boxById = await fetchBoxLabels(db, relatedBoxIds);
  const statusCounts = aggregateStatuses(historicalSeries, box.id, boxById);
  const currentUnits = statusCounts.reduce((total, item) => total + item.count, 0);
  const dominant = statusCounts[0] ?? null;

  const destination =
    dispatch?.notes ||
    dominant?.label ||
    movement?.target_location ||
    movement?.target_module ||
    null;
  const classification = classifyExternalBoxOutcome({
    rack: box.rack_location,
    movementType: movement?.movement_type,
    dispatchReference,
    dominantUnitStatus: dominant?.status,
    destinationLabel: destination,
    hasApprovedDeletion: Boolean(deletionResult.data),
  });
  const reference =
    dispatchReference || movement?.guide_number || movement?.reference_doc || null;

  return {
    boxId: box.id,
    boxCode: box.box_code || box.id,
    rack: box.rack_location || 'SIN UBICACIÓN',
    locationLabel: describeBoxLocation(
      box.rack_location,
      classification.outcome,
      destination,
    ),
    ...classification,
    detail: describeBoxTraceDetail({
      outcome: classification.outcome,
      currentUnits,
      dominantLabel: dominant?.label,
      dominantCount: dominant?.count,
      destination,
    }),
    movementType: movement?.movement_type ?? null,
    destination,
    reference,
    movedAt: dispatch?.dispatched_at || movement?.created_at || null,
    performedBy: movement?.performed_by_name ?? null,
    currentUnits,
    statusCounts,
  };
}
