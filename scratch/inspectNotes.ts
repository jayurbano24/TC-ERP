import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

async function main() {
  const { data: recs, error } = await supabase.from('receptions').select('id, notes, received_units');
  if (error) console.error(error);
  
  recs?.forEach(r => {
    if (r.notes && r.notes.includes('Backoffice_Tech')) {
       console.log("Found Tech:", r.notes.match(/Backoffice_Tech:\s*([^\n]+)/)?.[1]);
    }
    if (r.notes && r.notes.includes('Backoffice_Category')) {
       console.log("Found Cat:", r.notes.match(/Backoffice_Category:\s*([^\n]+)/)?.[1]);
    }
  });
}
main();
