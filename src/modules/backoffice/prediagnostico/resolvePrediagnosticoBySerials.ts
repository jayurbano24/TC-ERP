import type { SupabaseClient } from '@supabase/supabase-js';

export type PrediagnosticoSerialResolveRow = {
  serial: string;
  serviceOrderId: string;
  osLabel: string;
  techId: string;
  brandId: string;
  modelId: string;
  hasPrediagnostico: boolean;
};

type ModelEmbed = {
  brand_id: string | null;
  technology_id: string | null;
};

type SeriesRow = {
  serial_number: string;
  service_order_id: string;
  brand_id: string | null;
  model_id: string | null;
  current_status: string | null;
  service_orders:
    | {
        id: string;
        os_label: string | null;
        model_id: string | null;
      }
    | {
        id: string;
        os_label: string | null;
        model_id: string | null;
      }[]
    | null;
  models: ModelEmbed | ModelEmbed[] | null;
};

const CLOSED_STATUS_MARKERS = ['CERRAD', 'CLOSED', 'DESPACH', 'ANULAD', 'CANCEL'];

function isClosedStatus(status: string | null | undefined): boolean {
  const s = (status || '').toUpperCase();
  return CLOSED_STATUS_MARKERS.some((marker) => s.includes(marker));
}

function pickModel(models: SeriesRow['models']): ModelEmbed | null {
  if (!models) return null;
  if (Array.isArray(models)) return models[0] ?? null;
  return models;
}

function pickServiceOrder(
  serviceOrders: SeriesRow['service_orders']
): { id: string; os_label: string | null; model_id: string | null } | null {
  if (!serviceOrders) return null;
  if (Array.isArray(serviceOrders)) return serviceOrders[0] ?? null;
  return serviceOrders;
}

export async function resolvePrediagnosticoBySerials(
  supabase: SupabaseClient,
  serials: string[]
): Promise<PrediagnosticoSerialResolveRow[]> {
  const tokens = [...new Set(serials.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 25);
  if (tokens.length === 0) return [];

  const { data: seriesRows, error } = await supabase
    .from('series')
    .select(
      `
      serial_number,
      service_order_id,
      brand_id,
      model_id,
      current_status,
      service_orders (
        id,
        os_label,
        model_id
      ),
      models:model_id (
        brand_id,
        technology_id
      )
    `
    )
    .in('serial_number', tokens);

  if (error) {
    throw new Error(error.message);
  }

  const bySerial = new Map<string, PrediagnosticoSerialResolveRow>();

  for (const row of seriesRows || []) {
    const serial = String(row.serial_number || '').trim().toUpperCase();
    const os = pickServiceOrder(row.service_orders as SeriesRow['service_orders']);
    if (!serial || !os?.id || isClosedStatus(row.current_status)) continue;

    const modelEmbed = pickModel(row.models);
    const modelId = row.model_id || os.model_id || '';
    const techId = modelEmbed?.technology_id || '';
    const brandId = row.brand_id || modelEmbed?.brand_id || '';
    if (!modelId || !techId) continue;

    bySerial.set(serial, {
      serial,
      serviceOrderId: os.id,
      osLabel: os.os_label || os.id,
      techId,
      brandId,
      modelId,
      hasPrediagnostico: false,
    });
  }

  const osIds = [...new Set([...bySerial.values()].map((r) => r.serviceOrderId))];
  if (osIds.length === 0) {
    return tokens.filter((t) => bySerial.has(t)).map((t) => bySerial.get(t)!);
  }

  const { data: preds, error: predError } = await supabase
    .from('prediagnosticos')
    .select('service_order_id')
    .in('service_order_id', osIds);

  if (!predError) {
    const predSet = new Set((preds || []).map((r) => String(r.service_order_id)));
    for (const entry of bySerial.values()) {
      entry.hasPrediagnostico = predSet.has(entry.serviceOrderId);
    }
  }

  return tokens.filter((t) => bySerial.has(t)).map((t) => bySerial.get(t)!);
}
