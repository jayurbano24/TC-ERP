const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const payload = {
    source: 'cac',
    guide_number: 'TEST-123',
    carrier: 'CARGO EXPRESO',
    received_by: 'OPERADOR CQRS',
    received_units: 1,
    status: 'RECEPCIONADA',
    notes: '--- LÍNEA DE TIEMPO\\nGuías Procesadas:\\nGuías: TEST-123\\nEquipos: TEST-123'
  };
  const { data, error } = await supabase.from('receptions').insert(payload).select();
  console.log("Error:", error);
  console.log("Data:", data);
}
test();
