import type { ProductionOrderSummary } from '../domain/types/production-order.types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/http/apiFetch';

async function getOperatorContext() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return {};
  const { data } = await supabase.auth.getUser();
  return {
    operatorId: data?.user?.id ?? null,
    operatorName:
      data?.user?.user_metadata?.full_name || data?.user?.email || 'Operador',
  };
}

export async function fetchActiveProductionOrders(): Promise<{
  success: boolean;
  data?: ProductionOrderSummary[];
  error?: string;
}> {
  const res = await apiFetch('/api/production-orders', { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) return { success: false, error: json.error || 'Error al listar PO' };
  return { success: true, data: json.data };
}

export async function createProductionOrderApi(input: {
  technologyId?: string;
  modelId?: string;
  targetQuantity?: number;
  notes?: string;
}) {
  const operator = await getOperatorContext();
  const res = await apiFetch('/api/production-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, ...operator }),
  });
  const json = await res.json();
  if (!res.ok) return { success: false as const, error: json.error || 'Error al crear PO' };
  return { success: true as const, data: json.data };
}

export async function approveProductionOrderApi(poId: string) {
  const operator = await getOperatorContext();
  const res = await apiFetch(`/api/production-orders/${poId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(operator),
  });
  const json = await res.json();
  if (!res.ok) return { success: false as const, error: json.error || 'Error al aprobar PO' };
  return { success: true as const };
}

export async function assignOsToProductionOrderApi(poId: string, serviceOrderId: string) {
  const res = await apiFetch(`/api/production-orders/${poId}/assign-os`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceOrderId }),
  });
  const json = await res.json();
  if (!res.ok) return { success: false as const, error: json.error || 'Error al asignar OS' };
  return { success: true as const };
}
