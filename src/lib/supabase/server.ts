import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appConfig } from "@/lib/app-config";

/**
 * Cliente service-role (singleton).
 * Scope RLS por request: `withResolvedReadClient` + DI en `container.ts`
 * leen ALS desde `server-request-scope.ts` (no importar ese módulo aquí —
 * este archivo aún entra en algunos Client Components legacy).
 */
let serviceRoleSingleton: SupabaseClient | null = null;

function createServiceRoleClient(): SupabaseClient {
  if (!appConfig.supabase.configured) {
    throw new Error("Supabase is not configured.");
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || appConfig.supabase.anonKey;
  return createClient(appConfig.supabase.url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getSupabaseServerClient(): SupabaseClient {
  if (!serviceRoleSingleton) {
    serviceRoleSingleton = createServiceRoleClient();
  }
  return serviceRoleSingleton;
}
