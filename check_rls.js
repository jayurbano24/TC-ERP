const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data } = await supabase.rpc('get_schema_info', { table_name: 'log_orden_servicio' });
  // alternative query to pg_tables
  const { data: rls } = await supabase.from('pg_class').select('relrowsecurity').eq('relname', 'log_orden_servicio');
  console.log("RLS:", rls);
}
test();
