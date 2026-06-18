/**
 * Crea una recepción CAC de prueba para validar flujo Backoffice (courier ≠ agencia).
 *
 * Uso:
 *   node create_test_ingreso.js
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const GUIDE = `TEST-ING-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
const COURIER = 'Cargo Express';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('=== INGRESO DE PRUEBA CAC ===\n');

  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, code, name')
    .order('name')
    .limit(5);

  if (agencies?.length) {
    console.log('Agencias CAC disponibles (use una al clasificar equipos):');
    agencies.forEach((a) => console.log(`  • ${a.code || a.id} — ${a.name}`));
    console.log('');
  }

  const { data: existing } = await supabase
    .from('receptions')
    .select('id')
    .eq('guide_number', GUIDE);

  if (existing?.length) {
    const ids = existing.map((r) => r.id);
    await supabase.from('reception_guides').delete().in('reception_id', ids);
    await supabase.from('receptions').delete().in('id', ids);
    console.log(`Eliminada recepción previa ${GUIDE}\n`);
  }

  const notes = [
    `Piloto: PILOTO PRUEBA`,
    `Courier: ${COURIER}`,
    `Guías: ${GUIDE}`,
    '',
    '--- LÍNEA DE TIEMPO (MATRIZ) ---',
    `[${new Date().toLocaleString()}] MOV-TEST | REC-01 | RECEPCIÓN: Ingreso de prueba CAC`,
  ].join('\n');

  const reception = {
    source: 'cac',
    guide_number: GUIDE,
    carrier: COURIER,
    status: 'RECEPCIONADA',
    received_units: 1,
    expected_units: 1,
    processed_guides: [],
    received_by: null,
    notes,
  };

  const { data: rec, error: recErr } = await supabase
    .from('receptions')
    .insert([reception])
    .select('id, guide_number, carrier, status')
    .single();

  if (recErr) {
    console.error('Error creando recepción:', recErr.message);
    process.exit(1);
  }

  const { error: guideErr } = await supabase.from('reception_guides').insert([
    {
      reception_id: rec.id,
      guide_number: GUIDE,
      status: 'PENDIENTE',
    },
  ]);

  if (guideErr) {
    console.error('Error creando reception_guide:', guideErr.message);
    process.exit(1);
  }

  console.log('✅ Recepción creada:');
  console.log(`   ID:      ${rec.id}`);
  console.log(`   Guía:    ${rec.guide_number}`);
  console.log(`   Courier: ${rec.carrier}`);
  console.log(`   Status:  ${rec.status}`);
  console.log('\n--- Pasos en Backoffice ---');
  console.log('1. Abra http://localhost:3000/produccion/backoffice');
  console.log('2. Busque la tarjeta con guía', GUIDE);
  console.log('3. Procesar → Equipos');
  console.log('4. Seleccione Agencia CAC del catálogo (NO es Cargo Express)');
  console.log('5. Agregue Traslado SAP de prueba, ej. SAP-TEST-001');
  console.log('6. Ingrese 1 equipo con serie TEST-SERIE-001');
  console.log('7. Finalice y verifique en Historial Global');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
