const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2].replace(/\r$/, '');
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const recordId = '42181e00-02d2-4bb0-969f-c1e25ae7c1aa';
  
  // Try inserting
  const { error: insertErr } = await supabase.from('audit_logs').insert({
    table_name: 'series',
    record_id: recordId,
    action: 'TEST',
    payload: { test: true }
  });
  console.log("Insert Err:", insertErr);

  // Try fetching
  const { data, error } = await supabase
    .from('audit_logs')
    .select(`
      id,
      action,
      changed_at,
      payload,
      changed_by
    `)
    .eq('record_id', recordId)
    .order('changed_at', { ascending: false });

  console.log("Fetch Data:", data);
  console.log("Fetch Error:", error);
}

test();
