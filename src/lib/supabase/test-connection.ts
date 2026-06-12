import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export async function testSupabaseConnection() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { success: false, error: "Supabase not configured" };

  // Probamos con una tabla operativa básica en lugar de perfiles
  const { data, error } = await supabase.from('receptions').select('id').limit(1);
  
  if (error) {
    console.error("Detalles técnicos del error de Supabase:", error);
    return { success: false, error: error.message || "Error de red o sesión caducada (Token inválido)" };
  }

  return { success: true, data };
}
