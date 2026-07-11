const fs = require('fs');

const assertLine =
  "  PERFORM public.app_assert_any_role('admin', 'supervisor', 'receptor_px', 'receptor_cac');\n";

const targets = [
  { file: 'supabase/migrations/057_reception_received_by.sql', names: ['join_or_start_px_reception_tx'] },
  {
    file: 'supabase/migrations/039_px_incremental_capture.sql',
    names: [
      'acquire_box_lock_tx',
      'release_box_lock_tx',
      'adjust_px_box_quantity_tx',
      'close_px_box_tx',
      'capture_px_equipment_tx',
      'reopen_px_box_tx',
      'promote_px_box_tx',
    ],
  },
  {
    file: 'supabase/migrations/049_px_void_equipment_delete_box.sql',
    names: ['void_px_equipment_tx', 'delete_px_capture_box_tx'],
  },
  { file: 'supabase/migrations/072_finalize_px_setbased.sql', names: ['finalize_px_reception_tx'] },
  { file: 'supabase/migrations/076_finalize_px_prep_only.sql', names: ['finalize_px_reception_prep_tx'] },
  { file: 'supabase/migrations/081_finalize_px_prep_seq_sync.sql', names: ['finalize_px_reception_prep_one_box_tx'] },
  { file: 'supabase/migrations/075_finalize_px_batch.sql', names: ['finalize_px_reception_batch_tx'] },
];

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
      console.log('skip', name);
      results.push(body);
      continue;
    }
    const asIdx = body.search(/AS\s+\$\$/i);
    const beginIdx = body.indexOf('BEGIN', asIdx);
    let i = beginIdx + 'BEGIN'.length;
    if (body[i] === '\r') i++;
    if (body[i] === '\n') i++;
    body = body.slice(0, i) + assertLine + body.slice(i);
    results.push(body);
    console.log('patched', name, body.length);
  }
  return results;
}

for (const t of targets) {
  const sql = fs.readFileSync(t.file, 'utf8');
  out.push(...extractFunctions(sql, t.names));
  out.push('');
}
fs.writeFileSync('supabase/migrations/_gen_108_px.sql', out.join('\n'));
console.log('bytes', Buffer.byteLength(out.join('\n')));
