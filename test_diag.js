import { getSupabaseBrowserClient } from './src/lib/supabase/client';

async function test() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('cat_diagnostics')
    .select(`
      id,
      name,
      cat_diagnostic_repairs ( repair_id )
    `);
    
  console.log("DATA:", data);
  console.log("ERROR:", error);
}

test();
