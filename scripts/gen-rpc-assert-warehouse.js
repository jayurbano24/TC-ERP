const fs = require('fs');

const targets = [
  { file: 'supabase/migrations/085_warehouse_tx_idempotency.sql', names: ['warehouse_traslado_tx', 'warehouse_dispersion_tx'] },
  { file: 'supabase/migrations/082_warehouse_tx_fix_for_update_agg.sql', names: ['warehouse_salida_tx'] },
  { file: 'supabase/migrations/055_warehouse_sap_sync_chg002.sql', names: ['warehouse_ingreso_tx'] },
  {
    file: 'supabase/migrations/048_warehouse_phase4_dispatch_batches.sql',
    names: ['warehouse_salida_parcial_tx', 'dispatch_batch_open_tx', 'dispatch_batch_close_tx'],
  },
  { file: 'supabase/migrations/047_warehouse_phase3.sql', names: ['warehouse_traslado_parcial_tx'] },
  { file: 'supabase/migrations/095_warehouse_log_movement_unique.sql', names: ['create_bodega_box_tx'] },
];

const assertLine = "  PERFORM public.app_assert_any_role('admin', 'supervisor', 'bodega');\n";
const out = [];

function extractFunctions(sql, names) {
  const results = [];
  for (const name of names) {
    const re = new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name + '\\([\\s\\S]*?\\n\\$\\$;', 'i');
    const m = sql.match(re);
    if (!m) {
      console.error('MISSING', name);
      continue;
    }
    let body = m[0];
    if (body.includes('app_assert_any_role')) {
      console.log('skip already', name);
      results.push(body);
      continue;
    }
    const asIdx = body.search(/AS\s+\$\$/i);
    if (asIdx < 0) {
      console.error('no AS', name);
      continue;
    }
    const beginIdx = body.indexOf('BEGIN', asIdx);
    if (beginIdx < 0) {
      console.error('no BEGIN', name);
      continue;
    }
    let i = beginIdx + 'BEGIN'.length;
    if (body[i] === '\r') i++;
    if (body[i] === '\n') i++;
    body = body.slice(0, i) + assertLine + body.slice(i);
    results.push(body);
    console.log('patched', name);
  }
  return results;
}

for (const t of targets) {
  const sql = fs.readFileSync(t.file, 'utf8');
  out.push(...extractFunctions(sql, t.names));
  out.push('');
}
fs.writeFileSync('supabase/migrations/_gen_106_bodies.sql', out.join('\n'));
console.log('done bytes', Buffer.byteLength(out.join('\n')));
