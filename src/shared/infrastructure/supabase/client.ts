import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente para uso en componentes del lado del cliente (Anon Key)
export const supabaseClient: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export default supabaseClient;
