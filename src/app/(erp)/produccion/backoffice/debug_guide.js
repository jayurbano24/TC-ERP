
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Key missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function findGuide() {
  const { data, error } = await supabase
    .from('receptions')
    .select('*')
    .eq('guide_number', '55449909');

  if (error) {
    console.error('Error fetching guide:', error);
    return;
  }

  if (!data || data.length === 0) {
    console.log('Guide 55449909 NOT FOUND in receptions table.');
    // Check if it's inside processed_guides of another reception
    const { data: allRecs, error: allErr } = await supabase
        .from('receptions')
        .select('*');
    
    const parent = allRecs?.find(r => r.processed_guides?.includes('55449909'));
    if (parent) {
        console.log('Guide found inside processed_guides of parent reception:', parent.id);
        console.log('Parent status:', parent.status);
        console.log('Parent notes:', parent.notes);
    } else {
        console.log('Guide NOT FOUND anywhere.');
    }
    return;
  }

  console.log('Guide Found:');
  data.forEach(r => {
    console.log('---');
    console.log('ID:', r.id);
    console.log('Status:', r.status);
    console.log('Notes:', r.notes);
  });
}

findGuide();
