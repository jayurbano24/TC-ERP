const supabaseProjectRef = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF?.trim() ?? "";
const explicitSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const supabaseUrl = explicitSupabaseUrl ||
  (supabaseProjectRef ? `https://${supabaseProjectRef}.supabase.co` : "");

export const appConfig = {
  supabase: {
    projectRef: supabaseProjectRef,
    url: supabaseUrl,
    anonKey: supabaseAnonKey,
    configured: Boolean(supabaseUrl && supabaseAnonKey),
  },
} as const;
