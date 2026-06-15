import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data, error } = await supabase.from('erp_audit_logs').select('action');
  if (error) console.error(error);
  const counts = data?.reduce((acc: any, log: any) => {
    acc[log.action] = (acc[log.action] || 0) + 1;
    return acc;
  }, {});
  console.log(JSON.stringify(counts, null, 2));
}

main();
