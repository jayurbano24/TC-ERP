import type { SupabaseClient } from '@supabase/supabase-js';

export type PrediagnosticoBackfillCandidate = {
  serviceOrderId: string;
  serial: string;
  modelId: string;
  brandId: string;
  techId: string;
  ingressAt: Date;
  currentStatus: string;
  isScrap: boolean;
};

type RpcRow = {
  service_order_id: string;
  serial_number: string | null;
  model_id: string;
  brand_id: string | null;
  technology_id: string;
  ingress_at: string;
  current_status: string | null;
};

export async function listPrediagnosticoBackfillCandidates(
  supabase: SupabaseClient,
  cutoff: Date,
  limit: number,
  offset: number,
  isScrap: (status: string | null | undefined) => boolean
): Promise<PrediagnosticoBackfillCandidate[]> {
  const { data, error } = await supabase.rpc('list_prediagnostico_backfill_candidates', {
    p_cutoff: cutoff.toISOString(),
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    if (/list_prediagnostico_backfill_candidates|42883|does not exist/i.test(error.message)) {
      throw new Error(
        'Falta aplicar migración 255_prediagnostico_backfill_candidates.sql en Supabase.'
      );
    }
    throw new Error(error.message);
  }

  return ((data || []) as RpcRow[])
    .map((row) => {
      const serial = String(row.serial_number || row.service_order_id || '').trim();
      const brandId = row.brand_id || '';
      const currentStatus = row.current_status || '';
      return {
        serviceOrderId: String(row.service_order_id),
        serial,
        modelId: String(row.model_id),
        brandId: String(brandId),
        techId: String(row.technology_id),
        ingressAt: new Date(row.ingress_at),
        currentStatus,
        isScrap: isScrap(currentStatus),
      };
    })
    .filter((row) => row.serial && row.modelId && row.techId);
}
