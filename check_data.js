const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Checking log_orden_servicio...");
  const { data: orden, error: err1 } = await supabase.from('log_orden_servicio').select('*');
  console.log("log_orden_servicio:", orden?.length, "records. Error:", err1);

  console.log("Checking log_equipo...");
  const { data: equipo, error: err2 } = await supabase.from('log_equipo').select('*');
  console.log("log_equipo:", equipo?.length, "records. Error:", err2);

  console.log("Checking receptions...");
  const { data: rec, error: err3 } = await supabase.from('receptions').select('*');
  console.log("receptions:", rec?.length, "records. Error:", err3);
}
test();
