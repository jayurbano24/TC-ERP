import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appConfig } from "@/lib/app-config";

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient() {
  if (!appConfig.supabase.configured) {
    return null;
  }

  if (!browserClient) {
    browserClient = createClient(appConfig.supabase.url, appConfig.supabase.anonKey);
  }

  return browserClient;
}