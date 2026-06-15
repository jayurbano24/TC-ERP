import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data: series } = await supabase
    .from('series')
    .select('current_status, count', { count: 'exact' });
    
  console.log("Current status counts:");
  const counts: any = {};
  series?.forEach(s => {
      counts[s.current_status] = (counts[s.current_status] || 0) + 1;
  });
  console.log(counts);
}

run();
