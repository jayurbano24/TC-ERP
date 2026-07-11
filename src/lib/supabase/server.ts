import { AsyncLocalStorage } from "async_hooks";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appConfig } from "@/lib/app-config";

/**
 * ADR-011 2A/2C — cliente por request (RLS) sin refactor masivo de DI/providers.
 * Si hay cliente en el store (runWithSupabaseClient), se usa ese;
 * si no, service role (comportamiento histórico).
 */
const supabaseRequestStore = new AsyncLocalStorage<SupabaseClient>();

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
  const scoped = supabaseRequestStore.getStore();
  if (scoped) return scoped;

  if (!serviceRoleSingleton) {
    serviceRoleSingleton = createServiceRoleClient();
  }
  return serviceRoleSingleton;
}

/** Ejecuta `fn` con un cliente concreto (p. ej. JWT + RLS vía resolveReadClient). */
export function runWithSupabaseClient<T>(
  client: SupabaseClient,
  fn: () => Promise<T>
): Promise<T> {
  return supabaseRequestStore.run(client, fn);
}
