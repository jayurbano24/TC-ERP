const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
supabase.from('service_orders').select('*, series(*, receptions(*))').eq('os_label', 'TC-00020').then(res => console.log(JSON.stringify(res.data, null, 2)));
