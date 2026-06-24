import type { DispatchBatchSummary } from '../domain/types/dispatch-batch.types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

type OperatorContext = {
  operatorId?: string | null;
  operatorName?: string;
};

async function getOperatorContext(): Promise<OperatorContext> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return {};
  const { data } = await supabase.auth.getUser();
  return {
    operatorId: data?.user?.id ?? null,
    operatorName:
      data?.user?.user_metadata?.full_name || data?.user?.email || 'Operador',
  };
}

export async function fetchOpenDispatchBatches(): Promise<{
  success: boolean;
  data?: DispatchBatchSummary[];
  error?: string;
}> {
  const res = await fetch('/api/dispatch-batches', { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) return { success: false, error: json.error || 'Error al listar lotes' };
  return { success: true, data: json.data };
}

export async function openDispatchBatchApi(input: {
  destination?: string;
  guideOutbound?: string;
  notes?: string;
}): Promise<{
  success: boolean;
  data?: { batchId: string; batchNumber: string };
  error?: string;
}> {
  const operator = await getOperatorContext();
  const res = await fetch('/api/dispatch-batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, ...operator }),
  });
  const json = await res.json();
  if (!res.ok) return { success: false, error: json.error || 'Error al abrir lote' };
  return {
    success: true,
    data: { batchId: json.data.batchId, batchNumber: json.data.batchNumber },
  };
}

export async function closeDispatchBatchApi(batchId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const operator = await getOperatorContext();
  const res = await fetch(`/api/dispatch-batches/${batchId}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(operator),
  });
  const json = await res.json();
  if (!res.ok) return { success: false, error: json.error || 'Error al cerrar lote' };
  return { success: true };
}
