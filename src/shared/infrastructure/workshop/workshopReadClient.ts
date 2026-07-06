import { getSupabaseServerClient } from '@/lib/supabase/server';

/** Lectura de cola Taller con service role — misma vista para todos los operadores con acceso. */
export function getWorkshopReadClient() {
  return getSupabaseServerClient();
}
