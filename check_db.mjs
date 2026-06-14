import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('series').select('current_status, count');
  console.log('Error?', error);
  // group by status
  const { data: allSeries } = await supabase.from('series').select('current_status');
  const counts = {};
  for(let s of allSeries || []) {
    counts[s.current_status] = (counts[s.current_status] || 0) + 1;
  }
  console.log('Statuses:', counts);
}
check();
