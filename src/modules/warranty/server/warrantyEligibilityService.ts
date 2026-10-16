import type { SupabaseClient } from '@supabase/supabase-js';
import {
  evaluateIngressWarranty,
  resolveWarrantyDispatchProfile,
  type WarrantyDispatchSnapshot,
} from '../domain/warrantyPolicy';

const REPAIR_ACTIONS = ['REPARACIÓN COMPLETADA', 'REPARACION COMPLETADA'];
const QC_REACOND_ACTIONS = [
  'CONTROL DE CALIDAD COMPLETADO',
  'REACONDICIONADO COMPLETADO',
  'REACONDICIÓN COMPLETADA',
];

function normalizeSerials(serials: string[]): string[] {
  return [...new Set(serials.map((s) => String(s || '').trim()).filter(Boolean))];
}

function isDispatchedOsStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').toUpperCase();
  return s.includes('DESPACHADO') || s === 'CERRADO';
}

async function loadPriorServiceOrder(
  supabase: SupabaseClient,
  serials: string[],
  priorReentryCount: number
): Promise<{
  id: string;
  status: string | null;
  closed_at: string | null;
  main_serial: string | null;
} | null> {
  const sns = normalizeSerials(serials);
  if (!sns.length || priorReentryCount < 1) return null;

  const upper = sns.map((s) => s.toUpperCase());

  const { data: seriesRows } = await supabase
    .from('series')
    .select('service_order_id')
    .in('serial_number', sns);

  const osIds = [
    ...new Set(
      (seriesRows ?? [])
        .map((r) => r.service_order_id as string | null)
        .filter(Boolean) as string[]
    ),
  ];

  const collected: Array<{
    id: string;
    status: string | null;
    closed_at: string | null;
    main_serial: string | null;
    reentry_count: number | null;
    created_at: string;
  }> = [];

  if (osIds.length) {
    const { data } = await supabase
      .from('service_orders')
      .select('id, status, closed_at, main_serial, reentry_count, created_at')
      .in('id', osIds)
      .eq('reentry_count', priorReentryCount)
      .order('created_at', { ascending: false })
      .limit(10);
    collected.push(...(data ?? []));
  }

  for (const sn of sns) {
    const { data } = await supabase
      .from('service_orders')
      .select('id, status, closed_at, main_serial, reentry_count, created_at')
      .ilike('main_serial', sn)
      .eq('reentry_count', priorReentryCount)
      .order('created_at', { ascending: false })
      .limit(3);
    collected.push(...(data ?? []));
  }

  const byId = new Map(collected.map((o) => [o.id, o]));
  const orders = [...byId.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const match =
    orders.find((o) => isDispatchedOsStatus(o.status)) ?? orders[0] ?? null;
  return match;
}

async function resolveDispatchTimestamp(
  supabase: SupabaseClient,
  serviceOrderId: string,
  mainSerial: string | null,
  closedAt: string | null
): Promise<string | null> {
  if (closedAt) return closedAt;

  const { data: seriesRows } = await supabase
    .from('series')
    .select('id')
    .eq('service_order_id', serviceOrderId);

  const seriesIds = (seriesRows ?? []).map((r) => r.id as string);
  if (!seriesIds.length && mainSerial) {
    const { data: bySn } = await supabase
      .from('series')
      .select('id')
      .ilike('serial_number', mainSerial.trim())
      .limit(5);
    for (const row of bySn ?? []) seriesIds.push(row.id as string);
  }

  if (!seriesIds.length) return null;

  const { data: diRows } = await supabase
    .from('dispatch_items')
    .select('dispatches:dispatch_id(dispatched_at)')
    .in('series_id', seriesIds)
    .limit(50);

  let best: string | null = null;
  for (const row of diRows ?? []) {
    const d = Array.isArray((row as { dispatches?: { dispatched_at?: string }[] }).dispatches)
      ? (row as { dispatches: { dispatched_at?: string }[] }).dispatches[0]
      : (row as { dispatches?: { dispatched_at?: string } }).dispatches;
    const at = d?.dispatched_at;
    if (!at) continue;
    if (!best || new Date(at).getTime() > new Date(best).getTime()) best = at;
  }
  return best;
}

async function loadWorkshopAuditFlags(
  supabase: SupabaseClient,
  serviceOrderId: string
): Promise<{ hadRepairCompleted: boolean; hadQcOrReacondCompleted: boolean }> {
  const { data: seriesRows } = await supabase
    .from('series')
    .select('id')
    .eq('service_order_id', serviceOrderId);

  const recordIds = (seriesRows ?? []).map((r) => String(r.id));
  if (!recordIds.length) {
    return { hadRepairCompleted: false, hadQcOrReacondCompleted: false };
  }

  const { data: audits } = await supabase
    .from('erp_audit_logs')
    .select('action')
    .in('record_id', recordIds)
    .limit(500);

  let hadRepairCompleted = false;
  let hadQcOrReacondCompleted = false;
  for (const row of audits ?? []) {
    const action = String(row.action ?? '').toUpperCase();
    if (REPAIR_ACTIONS.some((a) => action.includes(a.toUpperCase()))) hadRepairCompleted = true;
    if (QC_REACOND_ACTIONS.some((a) => action.includes(a.toUpperCase()))) {
      hadQcOrReacondCompleted = true;
    }
  }
  return { hadRepairCompleted, hadQcOrReacondCompleted };
}

export async function loadPriorWarrantyDispatchSnapshot(
  supabase: SupabaseClient,
  serials: string[],
  currentReentryCount: number
): Promise<WarrantyDispatchSnapshot | null> {
  if (currentReentryCount <= 1) return null;

  const priorOs = await loadPriorServiceOrder(supabase, serials, currentReentryCount - 1);
  if (!priorOs || !isDispatchedOsStatus(priorOs.status)) return null;

  const dispatchedAtIso = await resolveDispatchTimestamp(
    supabase,
    priorOs.id,
    priorOs.main_serial,
    priorOs.closed_at
  );
  if (!dispatchedAtIso) return null;

  const [{ data: prediag }, auditFlags] = await Promise.all([
    supabase
      .from('prediagnosticos')
      .select('clase_carcasa, dictamen')
      .eq('service_order_id', priorOs.id)
      .maybeSingle(),
    loadWorkshopAuditFlags(supabase, priorOs.id),
  ]);

  const profile = resolveWarrantyDispatchProfile({
    claseCarcasa: prediag?.clase_carcasa ?? null,
    dictamen: prediag?.dictamen ?? null,
    ...auditFlags,
  });
  if (!profile) return null;

  return {
    priorServiceOrderId: priorOs.id,
    dispatchedAtIso,
    profile,
  };
}

export type IngressWarrantyFields = {
  ingress_kind: 'normal' | 'garantia';
  warranty_basis_dispatch_at: string | null;
  warranty_basis_os_id: string | null;
  warranty_profile: 'listo' | 'bueno' | null;
};

export async function resolveIngressWarrantyFields(
  supabase: SupabaseClient,
  serials: string[],
  reentryCount: number,
  ingressAt: Date = new Date()
): Promise<IngressWarrantyFields> {
  const prior = await loadPriorWarrantyDispatchSnapshot(supabase, serials, reentryCount);
  const evalResult = evaluateIngressWarranty({
    reentryCount,
    ingressAt,
    priorDispatch: prior,
  });

  return {
    ingress_kind: evalResult.isGarantia ? 'garantia' : 'normal',
    warranty_basis_dispatch_at: prior?.dispatchedAtIso ?? null,
    warranty_basis_os_id: prior?.priorServiceOrderId ?? null,
    warranty_profile: evalResult.profile,
  };
}
