const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2].trim();
  }
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);

async function test() {
  const { data: boxes } = await supabase.from('boxes').select('*').order('created_at', { ascending: false }).limit(2);
  console.log("Boxes:", boxes);
  
  const boxIds = boxes.map(b => b.id);
  const { data: series } = await supabase.from('series').select(`
        *,
        receptions (guide_number, notes, carrier, received_by, status, created_at),
        service_orders (id, os_label, reentry_count)
      `).in('current_box_id', boxIds);
      
  console.log("Series:", JSON.stringify(series, null, 2));
}

test();
