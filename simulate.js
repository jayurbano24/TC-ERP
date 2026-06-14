const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const content = fs.readFileSync('c:/Users/Usuario01/TC-ERP/web/.env.local', 'utf8');
const urlMatch = content.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = content.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);
const secretMatch = content.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), secretMatch ? secretMatch[1].trim() : keyMatch[1].trim());

async function checkConstraint() {
  const { data, error } = await supabase.rpc('get_constraint_def', { constraint_name: 'time_logs_evento_detectado_check' });
  
  // If RPC is not available, we can just try random inserts to see what fails, or we can use the postgres connection string if available.
  // Actually we can just query the rest API if it exposes it, but usually not.
  // Let's just try to insert SALIDA_ALMUERZO and see if that fails too.
  
  const eventsToTest = ['SALIDA_ALMUERZO', 'INGRESO', 'SALIDA_FINAL', 'REGRESO_DESAYUNO', 'REGRESO_ALMUERZO', 'MARCAJE_ESPECIAL', 'INGRESO_ESPECIAL', 'SALIDA_ESPECIAL', 'SALIDA_REFACCION', 'REGRESO_REFACCION'];
  
  for (const ev of eventsToTest) {
    const { error } = await supabase.from('time_logs').insert({
      employee_id: "5aa70f3d-361d-4a2b-9d4f-8ffb1bcaed8a",
      evento_detectado: ev,
      es_dia_extra: false
    });
    console.log(ev, error ? "FAILED" : "SUCCESS");
    if (!error) {
       await supabase.from('time_logs').delete().eq('evento_detectado', ev);
    }
  }
}

checkConstraint();
