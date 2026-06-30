import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appConfig } from "@/lib/app-config";

let browserClient: SupabaseClient | null = null;

/**
 * Cliente Supabase de navegador (anon key) con sesión persistida en cookies
 * vía `@supabase/ssr`. Esto permite que el servidor (middleware, route handlers,
 * Server Components) lea la misma sesión desde las cookies de la request, en vez
 * de depender de un Bearer token leído de localStorage.
 */
export function getSupabaseBrowserClient() {
  if (!appConfig.supabase.configured) {
    return null;
  }

  if (!browserClient) {
    browserClient = createBrowserClient(appConfig.supabase.url, appConfig.supabase.anonKey);
  }

  return browserClient;
}
