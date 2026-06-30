import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appConfig } from "@/lib/app-config";

/**
 * Cliente Supabase con la IDENTIDAD del usuario (anon key + sesión en cookies).
 *
 * A diferencia de `getSupabaseServerClient()` (service role, salta RLS), este
 * cliente envía el JWT del usuario logueado, por lo que **respeta RLS**. Es la
 * vía recomendada para lecturas en route handlers / Server Components bajo el
 * modelo RLS-first. Devuelve `null` si Supabase no está configurado.
 */
export async function getSupabaseUserServerClient(): Promise<SupabaseClient | null> {
  if (!appConfig.supabase.configured) {
    return null;
  }

  const cookieStore = await cookies();

  return createServerClient(appConfig.supabase.url, appConfig.supabase.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Invocado desde un Server Component (cookies de solo lectura):
          // el refresh de la sesión lo realiza el middleware.
        }
      },
    },
  });
}
