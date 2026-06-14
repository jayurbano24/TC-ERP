const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''; // need to extract from .env.local
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const content = fs.readFileSync('c:/Users/Usuario01/TC-ERP/web/.env.local', 'utf8');
const urlMatch = content.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = content.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

const supabase = createClient(urlMatch[1].trim(), keyMatch[1].trim());

async function checkLogs() {
  const { data, error } = await supabase.from('time_logs').select('*, employees(nombre_completo)').order('timestamp', { ascending: false }).limit(5);
  console.log(JSON.stringify(data, null, 2));
}

checkLogs();
