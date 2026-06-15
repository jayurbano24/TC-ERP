const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: orden } = await supabase.from('log_orden_servicio').select('*');
  console.log("ServiceRole log_orden_servicio:", orden?.length);
  
  const { data: equipo } = await supabase.from('log_equipo').select('*');
  console.log("ServiceRole log_equipo:", equipo?.length);
  
  const { data: rec } = await supabase.from('receptions').select('*');
  console.log("ServiceRole receptions:", rec?.length);
}
test();
