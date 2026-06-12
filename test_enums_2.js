const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=([^\r\n]+)/);
const keyMatch = env.match(/SUPABASE_SERVICE_ROLE_KEY=([^\r\n]+)/);
const supabaseUrl = urlMatch[1].trim().replace(/^"|"$/g, '');
const supabaseKey = keyMatch[1].trim().replace(/^"|"$/g, '');
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
   const res = await supabase.from('dispatches').insert({dispatch_type: 'caja_completa'}).select('*');
   console.log('caja_completa', res.error ? res.error.message : 'Success');
   const res2 = await supabase.from('dispatches').insert({dispatch_type: 'box_full'}).select('*');
   console.log('box_full', res2.error ? res2.error.message : 'Success');
   const res3 = await supabase.from('dispatches').insert({dispatch_type: 'venta'}).select('*');
   console.log('venta', res3.error ? res3.error.message : 'Success');
   const res4 = await supabase.from('dispatches').insert({dispatch_type: 'sale'}).select('*');
   console.log('sale', res4.error ? res4.error.message : 'Success');
}
test();
