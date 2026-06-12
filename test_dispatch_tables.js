const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=([^\r\n]+)/);
const supabaseUrl = urlMatch[1].trim().replace(/^"|"$/g, '');
const supabaseKey = keyMatch[1].trim().replace(/^"|"$/g, '');
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from('dispatches').select('*').limit(1);
  if (error) console.log('Error dispatches:', error.message);
  else console.log('Dispatches:', data.length > 0 ? Object.keys(data[0]) : 'Empty, but table exists');

  const { data: d2, error: e2 } = await supabase.from('dispatch_history').select('*').limit(1);
  if (e2) console.log('Error dispatch_history:', e2.message);
  else console.log('Dispatch History:', d2.length > 0 ? Object.keys(d2[0]) : 'Empty, but table exists');
}
test();
