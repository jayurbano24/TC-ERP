import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  const { data: recs, error } = await supabase.from('receptions').select('id, notes, status, source, carrier');
  if (error) console.error(error);
  
  let pxCount = 0;
  let cacCount = 0;
  
  recs?.forEach(r => {
    if (r.notes?.includes('CLASIFICACIÓN')) {
      const match = r.notes.match(/Por:\s*([^\\n]+)/i);
      const user = match ? match[1].trim() : 'Unknown';
      console.log(`Classified by ${user}, source: ${r.source}`);
      if (r.source === 'px') pxCount++;
      if (r.source === 'cac') cacCount++;
    }
  });
  console.log(`PX: ${pxCount}, CAC: ${cacCount}`);
}
main();
