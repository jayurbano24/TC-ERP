
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function createTestGuides() {
  const guides = [
    { source: 'cac', guide_number: 'TEST-ACC-001', carrier: 'GUATE-EXPRESS', status: 'PENDIENTE', notes: 'Piloto: Juan Perez\nCaja de Cables y Cargadores' },
    { source: 'cac', guide_number: 'TEST-MOV-001', carrier: 'FORZA-LOGISTICS', status: 'PENDIENTE', notes: 'Piloto: Maria Lopez\nLote de Teléfonos en Bolsa' },
    { source: 'cac', guide_number: 'TEST-EQP-001', carrier: 'CAC-PROPIO', status: 'PENDIENTE', notes: 'Piloto: Carlos Ruiz\nEquipos para ingreso detallado' }
  ];

  console.log('🚀 Creando 3 guías de prueba...');

  for (const g of guides) {
    // Delete existing if any to avoid duplicate key errors
    await supabase.from('receptions').delete().eq('guide_number', g.guide_number);
    
    const { data, error } = await supabase.from('receptions').insert([g]);
    if (error) {
      console.error(`❌ Error creando ${g.guide_number}:`, error.message);
    } else {
      console.log(`✅ Guía ${g.guide_number} creada.`);
    }
  }
}

createTestGuides();
