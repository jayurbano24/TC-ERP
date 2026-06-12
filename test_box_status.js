const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/);
const supabaseUrl = urlMatch[1].trim().replace(/^"|"$/g, '');
const supabaseKey = keyMatch[1].trim().replace(/^"|"$/g, '');
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.rpc('get_enum_values', { enum_name: 'box_status' });
  if (error) {
     const { data: b, error: e } = await supabase.from('boxes').select('status');
     const statuses = new Set(b.map(x => x.status));
     console.log('Statuses:', Array.from(statuses));
  } else {
     console.log('Enum:', data);
  }
}
test();
