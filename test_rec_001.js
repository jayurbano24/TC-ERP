import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkRec() {
  const { data, error } = await supabase
    .from('receptions')
    .select('*')
    .eq('guide_number', 'REC-001');
    
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}

checkRec();
