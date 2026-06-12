import { createClient } from '@supabase/supabase-js';
require('dotenv').config({ path: '.env.local' });
const sup = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
sup.from('series').select('id, current_box_id').not('current_box_id', 'is', null).then(r => console.log('Series count:', r.data?.length));
