const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/);
const supabaseUrl = urlMatch[1].trim().replace(/^"|"$/g, '');
const supabaseKey = keyMatch[1].trim().replace(/^"|"$/g, '');
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('dispatches').insert({ dispatch_type: 'BOX' }).select('*');
  if (error) console.log(error.message);
}
test();
