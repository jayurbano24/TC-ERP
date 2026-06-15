const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data: logs } = await supabase.from('log_orden_servicio').select('*, equipo:log_equipo(*)');
  const { data: receptions } = await supabase.from('receptions').select('*');
  
  const recIds = new Set(receptions.map(r => r.guide_number));
  
  for (const log of logs) {
    const guideNumber = log.tipo_recepcion === 'CAC' ? log.equipo.numero_serie : (log.guia_px || 'S/N');
    if (!recIds.has(guideNumber)) {
      console.log("Missing dual write for:", guideNumber);
      await supabase.from('receptions').insert({
         source: log.tipo_recepcion.toLowerCase(),
         guide_number: guideNumber,
         carrier: log.transporte || 'CARGO EXPRESO',
         received_units: 1,
         status: 'RECEPCIONADA',
         notes: `--- LÍNEA DE TIEMPO\\nGuías Procesadas:\\nGuías: ${guideNumber}\\nEquipos: ${log.equipo.numero_serie}`,
      });
      console.log("Inserted!");
    }
  }
}
test();
