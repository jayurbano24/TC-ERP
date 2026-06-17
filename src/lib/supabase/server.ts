import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appConfig } from "@/lib/app-config";

export function getSupabaseServerClient(): SupabaseClient {
  if (!appConfig.supabase.configured) {
    throw new Error("Supabase is not configured.");
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || appConfig.supabase.anonKey;

  // Creamos un cliente usando la service key o anon key
  // Desactivamos persistSession porque en Edge/Serverless no necesitamos guardar sesión local
  return createClient(appConfig.supabase.url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}
