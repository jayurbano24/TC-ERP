import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Singleton para Server-Side (usa Service Role Key — acceso total, solo en servidor)
const globalForSupabase = globalThis as unknown as { supabaseServer: SupabaseClient | undefined };

export const supabaseServer: SupabaseClient =
  globalForSupabase.supabaseServer ??
  createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });

if (process.env.NODE_ENV !== 'production') {
  globalForSupabase.supabaseServer = supabaseServer;
}

export default supabaseServer;
