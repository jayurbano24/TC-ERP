// Clasificación de series huérfanas — NO MODIFICA DATOS
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || require('./src/config/supabase.json').url,
  process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || require('./src/config/supabase.json').anonKey
);

async function classify() {
  console.log('=== CLASIFICACIÓN DE SERIES HUÉRFANAS ===\n');

  // 1. Obtener TODAS las series huérfanas (current_reception_id IS NULL)
  const { data: orphans, error } = await supabase
    .from('series')
    .select('id, serial_number, brand_id, model_id, current_status, service_order_id, current_box_id, created_at, updated_at')
    .is('current_reception_id', null)
    .order('created_at', { ascending: false });

  if (error) { console.error('Error:', error); return; }
  
  console.log(`Total series huérfanas: ${orphans.length}\n`);

  // 2. Para cada huérfana, buscar en audit_logs quién la creó y quién la modificó
  const familias = {
    A_registerNewReturn: [],   // Creadas por devolución (notes contiene "Motivo:")
    B_con_brand_sin_reception: [], // Tienen brand_id pero no reception_id (perdieron vínculo)
    C_sin_os: [],              // Sin service_order_id
    D_sin_brand: [],           // Sin brand_id ni model_id (fantasma pura)
    E_con_os: [],              // Tienen OS pero no reception (raro)
    sin_clasificar: []
  };

  for (const s of orphans) {
    const isReturned = s.current_status === 'returned';
    const hasBrand = !!s.brand_id;
    const hasOS = !!s.service_order_id;

    if (isReturned && !hasBrand && !hasOS) {
      familias.A_registerNewReturn.push(s);
    } else if (hasBrand && hasOS) {
      familias.E_con_os.push(s);
    } else if (hasBrand && !hasOS) {
      familias.B_con_brand_sin_reception.push(s);
    } else if (!hasBrand && !hasOS) {
      familias.D_sin_brand.push(s);
    } else {
      familias.sin_clasificar.push(s);
    }
  }

  // 3. Imprimir resumen
  console.log('--- CLASIFICACIÓN POR FAMILIA ---');
  console.log(`\nFamilia A (devolución individual - returned sin brand/OS): ${familias.A_registerNewReturn.length}`);
  for (const s of familias.A_registerNewReturn.slice(0, 5)) {
    console.log(`  SN: ${s.serial_number} | status: ${s.current_status} | brand: ${s.brand_id ? 'SÍ' : 'NO'} | created: ${s.created_at} | updated: ${s.updated_at}`);
  }

  console.log(`\nFamilia B (brand SÍ, OS NO, reception NO — perdió vínculo): ${familias.B_con_brand_sin_reception.length}`);
  for (const s of familias.B_con_brand_sin_reception.slice(0, 5)) {
    console.log(`  SN: ${s.serial_number} | status: ${s.current_status} | created: ${s.created_at} | updated: ${s.updated_at} | modified: ${s.created_at !== s.updated_at}`);
  }

  console.log(`\nFamilia D (sin brand, sin OS — fantasma): ${familias.D_sin_brand.length}`);
  for (const s of familias.D_sin_brand.slice(0, 5)) {
    console.log(`  SN: ${s.serial_number} | status: ${s.current_status} | created: ${s.created_at}`);
  }

  console.log(`\nFamilia E (tiene OS pero no reception — raro): ${familias.E_con_os.length}`);
  for (const s of familias.E_con_os.slice(0, 5)) {
    console.log(`  SN: ${s.serial_number} | status: ${s.current_status} | os: ${s.service_order_id} | created: ${s.created_at}`);
  }

  console.log(`\nSin clasificar: ${familias.sin_clasificar.length}`);

  const bornOrphan = orphans.filter(s => s.created_at === s.updated_at).length;
  const modifiedAfter = orphans.filter(s => s.created_at !== s.updated_at).length;
  console.log(`\nNacieron huérfanas (created=updated): ${bornOrphan}`);
  console.log(`Modificadas después (created!=updated): ${modifiedAfter}`);

  // 4. Para Familia B (las más peligrosas), buscar audit trail
  console.log('\n\n=== AUDIT TRAIL — FAMILIA B (perdieron vínculo) ===');
  for (const s of familias.B_con_brand_sin_reception.slice(0, 10)) {
    // Buscar en erp_audit_logs
    const { data: audits } = await supabase
      .from('erp_audit_logs')
      .select('action, created_at, new_values, observations, module')
      .eq('table_name', 'series')
      .eq('record_id', s.id)
      .order('created_at', { ascending: true });

    // Buscar también en audit_logs (tabla original)
    const { data: oldAudits } = await supabase
      .from('audit_logs')
      .select('action, changed_at, payload')
      .eq('table_name', 'series')
      .eq('record_id', s.id)
      .order('changed_at', { ascending: true });

    const allAudits = [
      ...(audits || []).map(a => ({ time: a.created_at, action: a.action, detail: JSON.stringify(a.new_values || a.observations || '').substring(0, 120), source: 'erp_audit' })),
      ...(oldAudits || []).map(a => ({ time: a.changed_at, action: a.action, detail: JSON.stringify(a.payload || '').substring(0, 120), source: 'audit_logs' }))
    ].sort((a, b) => new Date(a.time) - new Date(b.time));

    console.log(`\n  SN: ${s.serial_number} (created: ${s.created_at} → updated: ${s.updated_at})`);
    console.log(`  status: ${s.current_status} | brand: ${s.brand_id ? 'SÍ' : 'NO'}`);
    if (allAudits.length === 0) {
      console.log(`  ⚠ SIN AUDIT TRAIL`);
    } else {
      for (const a of allAudits) {
        console.log(`  [${a.time}] ${a.source} → ${a.action}: ${a.detail}`);
      }
    }
  }

  // 5. Buscar si hay UPDATE series SET current_reception_id = NULL en audit logs
  console.log('\n\n=== BÚSQUEDA: ¿Alguien puso current_reception_id = NULL? ===');
  const { data: nullAudits } = await supabase
    .from('erp_audit_logs')
    .select('record_id, action, created_at, new_values, old_values, observations, module, performed_by')
    .eq('table_name', 'series')
    .order('created_at', { ascending: false })
    .limit(200);

  let foundNullReception = 0;
  for (const a of (nullAudits || [])) {
    const nv = a.new_values || {};
    const ov = a.old_values || {};
    if (nv.current_reception_id === null || nv.reception_id === null) {
      foundNullReception++;
      console.log(`  [${a.created_at}] ${a.action} | record: ${a.record_id} | module: ${a.module}`);
      console.log(`    old: ${JSON.stringify(ov).substring(0, 100)}`);
      console.log(`    new: ${JSON.stringify(nv).substring(0, 100)}`);
    }
  }
  if (foundNullReception === 0) {
    console.log('  No se encontró ningún audit que ponga current_reception_id = NULL');
  }

  // 6. Resumen final
  console.log('\n\n=== RESUMEN FINAL ===');
  console.log(`Total huérfanas: ${orphans.length}`);
  console.log(`  Familia A (registerNewReturn):           ${familias.A_registerNewReturn.length}`);
  console.log(`  Familia B (brand SÍ, perdió reception):  ${familias.B_con_brand_sin_reception.length}`);
  console.log(`  Familia D (fantasma sin brand):           ${familias.D_sin_brand.length}`);
  console.log(`  Familia E (tiene OS, no reception):       ${familias.E_con_os.length}`);
  console.log(`  Sin clasificar:                           ${familias.sin_clasificar.length}`);
  console.log(`\nSuma: ${familias.A_registerNewReturn.length + familias.B_con_brand_sin_reception.length + familias.D_sin_brand.length + familias.E_con_os.length + familias.sin_clasificar.length}`);
}

classify().catch(console.error);
