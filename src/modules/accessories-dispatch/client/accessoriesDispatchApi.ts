import { getSupabaseBrowserClient } from '@/lib/supabase/client';

async function getOperatorId() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user?.id ?? null;
}

export async function dispatchAccessoryOutApi(input: {
  accessoryId: string;
  condition: 'NEW' | 'RECOVERED';
  quantity: number;
  destination: string;
  notes?: string;
  dispatchBatchId?: string | null;
  boxId?: string | null;
}) {
  const operatorId = await getOperatorId();
  const res = await fetch('/api/accessories/dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...input, operatorId }),
  });
  const json = await res.json();
  if (!res.ok) return { error: json.error || 'Error al despachar accesorio' };
  return { success: true as const, data: json.data };
}
