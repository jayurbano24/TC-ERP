/**
 * Reparación Familia B — series con brand_id pero sin current_reception_id ni service_order_id
 *
 * Uso:
 *   node repair_family_b.js           # dry-run (solo muestra plan)
 *   node repair_family_b.js --apply   # ejecuta reparación
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const REC29877 = '29877a89-a6a4-417d-b4d8-25e74f47d712';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function assignReception(orphan, goodSeries) {
  const matches = goodSeries.filter(
    (s) => s.brand_id === orphan.brand_id && s.model_id === orphan.model_id
  );
  const recCounts = {};
  matches.forEach((m) => {
    recCounts[m.current_reception_id] = (recCounts[m.current_reception_id] || 0) + 1;
  });
  const sorted = Object.entries(recCounts).sort((a, b) => Number(b[1]) - Number(a[1]));

  if (sorted.length === 0) {
    return { reception_id: REC29877, method: 'default_cac_batch' };
  }
  if (sorted.length === 1) {
    return { reception_id: sorted[0][0], method: 'unique_brand_model' };
  }

  const [top, second] = sorted;
  if (!second || Number(top[1]) > Number(second[1]) * 2) {
    return { reception_id: top[0], method: 'majority_brand_model' };
  }
  if (Number(top[1]) > Number(second[1])) {
    return { reception_id: top[0], method: 'weak_majority' };
  }

  const on29877 = matches.some((m) => m.current_reception_id === REC29877);
  if (on29877) {
    return { reception_id: REC29877, method: 'tie_break_29877' };
  }
  return { reception_id: top[0], method: 'tie_break_top' };
}

function pickMainSerial(group, osOnReception) {
  const byExisting = group.find((s) =>
    osOnReception.some((os) => os.main_serial === s.serial_number)
  );
  if (byExisting) return byExisting.serial_number;

  const zteMain = group.find((s) => /^ZTE/i.test(s.serial_number));
  if (zteMain) return zteMain.serial_number;

  return [...group].sort((a, b) => a.serial_number.localeCompare(b.serial_number))[0]
    .serial_number;
}

async function resolveOsForGroup(receptionId, group, osOnReception, createdOs) {
  const mainSerial = pickMainSerial(group, osOnReception);
  let os =
    osOnReception.find((o) => o.main_serial === mainSerial) ||
    createdOs.find((o) => o.reception_id === receptionId && o.main_serial === mainSerial);

  if (!os) {
    const byCombo = osOnReception.filter(
      (o) => o.brand_id === group[0].brand_id && o.model_id === group[0].model_id
    );
    if (byCombo.length === 1) {
      os = byCombo[0];
      return { os, method: 'existing_unique_combo', mainSerial: os.main_serial };
    }

    if (!APPLY) {
      return { os: null, method: 'would_create_os', mainSerial };
    }

    const { count } = await supabase
      .from('service_orders')
      .select('*', { count: 'exact', head: true })
      .eq('main_serial', mainSerial);

    const { data: osData, error } = await supabase
      .from('service_orders')
      .insert([
        {
          reception_id: receptionId,
          model_id: group[0].model_id,
          brand_id: group[0].brand_id,
          main_serial: mainSerial,
          reentry_count: (count || 0) + 1,
          status: 'INGRESADO'
        }
      ])
      .select()
      .single();

    if (error) throw new Error(`Error creando OS para ${mainSerial}: ${error.message}`);
    os = osData;
    createdOs.push(os);
    return { os, method: 'created_os', mainSerial };
  }

  return { os, method: 'existing_main_serial', mainSerial };
}

async function main() {
  console.log(`=== REPARACIÓN FAMILIA B ${APPLY ? '(APLICANDO)' : '(DRY-RUN)'} ===\n`);

  const { data: orphans, error } = await supabase
    .from('series')
    .select('id, serial_number, brand_id, model_id, current_status, created_at')
    .is('current_reception_id', null)
    .not('brand_id', 'is', null)
    .is('service_order_id', null);

  if (error) {
    console.error('Error leyendo huérfanas:', error);
    process.exit(1);
  }

  if (!orphans?.length) {
    console.log('No hay series Familia B para reparar.');
    return;
  }

  const { data: goodSeries } = await supabase
    .from('series')
    .select('brand_id, model_id, current_reception_id')
    .not('current_reception_id', 'is', null);

  const { data: allOs } = await supabase
    .from('service_orders')
    .select('id, reception_id, main_serial, brand_id, model_id');

  const osByReception = {};
  (allOs || []).forEach((os) => {
    if (!osByReception[os.reception_id]) osByReception[os.reception_id] = [];
    osByReception[os.reception_id].push(os);
  });

  const plan = orphans.map((o) => ({
    ...o,
    ...assignReception(o, goodSeries || [])
  }));

  const groups = {};
  for (const item of plan) {
    const key = `${item.reception_id}|${item.created_at}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }

  const createdOs = [];
  const updates = [];
  const stats = {
    series: plan.length,
    groups: Object.keys(groups).length,
    reception_methods: {},
    os_methods: {},
    by_reception: {}
  };

  for (const [key, group] of Object.entries(groups)) {
    const receptionId = group[0].reception_id;
    const osOnReception = osByReception[receptionId] || [];
    const { os, method, mainSerial } = await resolveOsForGroup(
      receptionId,
      group,
      osOnReception,
      createdOs
    );

    stats.os_methods[method] = (stats.os_methods[method] || 0) + group.length;
    stats.by_reception[receptionId] = (stats.by_reception[receptionId] || 0) + group.length;

    for (const item of group) {
      stats.reception_methods[item.method] = (stats.reception_methods[item.method] || 0) + 1;
      updates.push({
        id: item.id,
        serial_number: item.serial_number,
        reception_id: receptionId,
        service_order_id: os?.id || null,
        reception_method: item.method,
        os_method: method,
        main_serial: mainSerial
      });
    }
  }

  console.log(`Series a reparar: ${stats.series}`);
  console.log(`Grupos (unidad CAC): ${stats.groups}`);
  console.log('Por recepción:', stats.by_reception);
  console.log('Métodos reception:', stats.reception_methods);
  console.log('Métodos OS:', stats.os_methods);
  console.log('\nMuestra (5):');
  updates.slice(0, 5).forEach((u) => {
    console.log(
      `  ${u.serial_number} → rec ${u.reception_id.slice(0, 8)} | OS ${u.service_order_id?.slice(0, 8) || 'PENDIENTE'} | ${u.reception_method} / ${u.os_method}`
    );
  });

  const withoutOs = updates.filter((u) => !u.service_order_id);
  if (withoutOs.length) {
    console.log(`\n⚠ Sin OS asignada (dry-run): ${withoutOs.length}`);
  }

  if (!APPLY) {
    console.log('\n[DRY-RUN] Para aplicar: node repair_family_b.js --apply');
    return;
  }

  console.log('\nAplicando actualizaciones...');
  let ok = 0;
  let fail = 0;

  for (const u of updates) {
    const payload = {
      current_reception_id: u.reception_id,
      updated_at: new Date().toISOString()
    };
    if (u.service_order_id) payload.service_order_id = u.service_order_id;

    const { error: updErr } = await supabase.from('series').update(payload).eq('id', u.id);
    if (updErr) {
      console.error(`  FAIL ${u.serial_number}:`, updErr.message);
      fail++;
    } else {
      ok++;
    }
  }

  console.log(`\nResultado: ${ok} actualizadas, ${fail} fallidas`);
  if (createdOs.length) {
    console.log(`OS creadas: ${createdOs.length}`);
  }

  const { count: remaining } = await supabase
    .from('series')
    .select('*', { count: 'exact', head: true })
    .is('current_reception_id', null)
    .not('brand_id', 'is', null);

  console.log(`Familia B restante: ${remaining ?? '?'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
