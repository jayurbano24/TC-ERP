import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveIngressWarrantyFields } from './warrantyEligibilityService';

/** Aplica marca Garantía a OS de una recepción (PX RPC no envía ingress_kind al insert). */
export async function syncWarrantyIngressForReception(
  supabase: SupabaseClient,
  receptionId: string
): Promise<number> {
  const { data: orders, error } = await supabase
    .from('service_orders')
    .select('id, main_serial, reentry_count, ingress_kind, created_at')
    .eq('reception_id', receptionId)
    .gt('reentry_count', 1);

  if (error || !orders?.length) return 0;

  let updated = 0;
  for (const os of orders) {
    if (String(os.ingress_kind) === 'garantia') continue;

    const { data: seriesRows } = await supabase
      .from('series')
      .select('serial_number')
      .eq('service_order_id', os.id);

    const serials = [
      os.main_serial,
      ...(seriesRows ?? []).map((r) => r.serial_number as string),
    ].filter(Boolean) as string[];

    const fields = await resolveIngressWarrantyFields(
      supabase,
      serials,
      Number(os.reentry_count) || 2,
      new Date(os.created_at)
    );

    if (fields.ingress_kind !== 'garantia' && !fields.warranty_basis_os_id) continue;

    const { error: upErr } = await supabase
      .from('service_orders')
      .update({
        ingress_kind: fields.ingress_kind,
        warranty_basis_dispatch_at: fields.warranty_basis_dispatch_at,
        warranty_basis_os_id: fields.warranty_basis_os_id,
        warranty_profile: fields.warranty_profile,
      })
      .eq('id', os.id);

    if (!upErr) updated += 1;
  }

  return updated;
}
