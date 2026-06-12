
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pivfuzpqrshvsqmnyfuv.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_KEY'; // Model will use current context if possible

const supabase = createClient(supabaseUrl, supabaseKey);

const guides = [
  {
    guide_number: 'G-E2E-ACC-777',
    carrier: 'CARGO EXPRESS',
    notes: 'Prueba E2E: Accesorios (Lote Único)',
    status: 'PENDIENTE_BACKOFFICE',
    source: 'cac',
    received_by: 'Admin User'
  },
  {
    guide_number: 'G-E2E-MOV-888',
    carrier: 'G221-AMATITLÁN',
    notes: 'Prueba E2E: Móviles (Lote Único)',
    status: 'PENDIENTE_BACKOFFICE',
    source: 'cac',
    received_by: 'Admin User'
  },
  {
    guide_number: 'G-E2E-EQP-999',
    carrier: 'ENTREGA DIRECTA',
    notes: 'Prueba E2E: Equipos Detallado (Lote Único)',
    status: 'PENDIENTE_BACKOFFICE',
    source: 'cac',
    received_by: 'Admin User'
  }
];

async function inject() {
  console.log('Injecting unique E2E test guides...');
  const { data, error } = await supabase.from('receptions').insert(guides);
  if (error) {
    console.error('Error injecting:', error);
  } else {
    console.log('Successfully injected 3 unique guides.');
  }
}

inject();
