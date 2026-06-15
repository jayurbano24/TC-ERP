const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('log_orden_servicio')
    .select('*, equipo:log_equipo(*)')
    .order('created_at', { ascending: false });
  console.log("Error:", error);
  console.log("Data length:", data ? data.length : null);
}
test();
