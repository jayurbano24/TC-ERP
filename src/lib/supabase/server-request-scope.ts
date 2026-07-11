import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseRequestStore = new AsyncLocalStorage<SupabaseClient>();

export function getRequestScopedClient(): SupabaseClient | undefined {
  return supabaseRequestStore.getStore();
}

export function runWithRequestScopedClient<T>(
  client: SupabaseClient,
  fn: () => Promise<T>
): Promise<T> {
  return supabaseRequestStore.run(client, fn);
}
