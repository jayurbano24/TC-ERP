
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function dumpData() {
  const { data, error } = await supabase
    .from('receptions')
    .select('id, guide_number, status, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    fs.writeFileSync('debug_db.txt', 'Error: ' + JSON.stringify(error, null, 2));
    return;
  }

  let output = '--- DUMP DE RECEPCIONES ---\n\n';
  data.forEach(r => {
    output += `GUÍA: ${r.guide_number}\n`;
    output += `ID: ${r.id}\n`;
    output += `STATUS: ${r.status}\n`;
    output += `FECHA: ${r.created_at}\n`;
    output += `NOTAS:\n${r.notes}\n`;
    output += '-------------------------------------------\n\n';
  });

  fs.writeFileSync('debug_db.txt', output);
  console.log('Dump completado en debug_db.txt');
}

dumpData();
