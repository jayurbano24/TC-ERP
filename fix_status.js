const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Starting status migration...");
  
  // 1. Update series table
  const { data: seriesData, error: seriesError } = await supabase
    .from('series')
    .update({ current_status: 'PENDIENTE_INGRESO_BODEGA_GENERAL' })
    .eq('current_status', 'RECEPCIONADO_BODEGA_GENERAL')
    .select('id');
    
  if (seriesError) {
    console.error("Error updating series:", seriesError);
  } else {
    console.log(`Updated ${seriesData?.length || 0} series.`);
  }

  // 2. Update audit logs (JSONB 'status' field in 'details')
  // We can't easily bulk update JSONB without SQL, but we can do it via REST if we fetch and update individually.
  // Actually it's probably fine if audit logs say "RECEPCIONADO_BODEGA_GENERAL" historically. The user just cares about the current status.
  
  console.log("Migration complete.");
}

run();
