
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function cleanDatabase() {
  console.log('🧹 Iniciando limpieza de datos operativos...');

  // El orden es importante por las llaves foráneas (FK)
  
  // 1. Limpiar Series (dependen de receptions y service_orders)
  console.log('- Limpiando tabla: series');
  const { error: err1 } = await supabase.from('series').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err1) console.error('Error en series:', err1.message);

  // 2. Limpiar Service Orders (dependen de receptions)
  console.log('- Limpiando tabla: service_orders');
  const { error: err2 } = await supabase.from('service_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err2) console.error('Error en service_orders:', err2.message);

  // 3. Limpiar Receptions
  console.log('- Limpiando tabla: receptions');
  const { error: err3 } = await supabase.from('receptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (err3) console.error('Error en receptions:', err3.message);

  console.log('\n✅ LIMPIEZA COMPLETADA.');
  console.log('Las tablas de configuración (Agencias, Marcas, Modelos) permanecen INTACTAS.');
  console.log('Ya puedes empezar a registrar guías desde cero.');
}

cleanDatabase();
