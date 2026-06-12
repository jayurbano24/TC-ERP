const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/);
const supabaseUrl = urlMatch[1].trim().replace(/^"|"$/g, '');
const supabaseKey = keyMatch[1].trim().replace(/^"|"$/g, '');
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.rpc('get_table_schema', { table_name: 'dispatches' });
  if (error) {
     const res = await supabase.from('dispatches').insert({dispatch_type: 'caja'}).select('*');
     console.log(res.error ? res.error.message : 'Success');
     const res2 = await supabase.from('dispatches').insert({dispatch_type: 'box'}).select('*');
     console.log(res2.error ? res2.error.message : 'Success');
     const res3 = await supabase.from('dispatches').insert({dispatch_type: 'CAJA'}).select('*');
     console.log(res3.error ? res3.error.message : 'Success');
  } else {
    console.log(data);
  }
}
test();
