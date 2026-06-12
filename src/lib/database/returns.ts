import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export async function getReturns() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];

  // In our schema, returns can be tracked in series with status 'returned'
  // Or we can have a specific returns table if needed.
  // For now, let's assume we use 'series' with a 'returned' status for simplicity
  // or a specific table if the user wants more detail.
  
  const { data, error } = await supabase
    .from('series')
    .select(`
      id,
      serial_number,
      current_status,
      updated_at,
      receptions (guide_number, carrier),
      service_orders (os_label)
    `)
    .eq('current_status', 'returned');

  if (error) return [];
  return data;
}

export async function registerNewReturn(returnEntry: any) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { error: "Supabase not configured" };

  // 1. Update series status to 'returned'
  const { error } = await supabase
    .from('series')
    .upsert({
      serial_number: returnEntry.sn,
      current_status: 'returned',
      notes: `Motivo: ${returnEntry.motivo}\nGuía Salida: ${returnEntry.guiaSalida}`
    }, { onConflict: 'serial_number' });

  if (error) return { error: error.message };
  return { success: true };
}
