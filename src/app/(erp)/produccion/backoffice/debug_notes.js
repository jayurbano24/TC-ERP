
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkNotes() {
  const { data, error } = await supabase
    .from('receptions')
    .select('guide_number, notes, status')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('--- ÚLTIMAS 10 RECEPCIONES ---');
  data.forEach(r => {
    console.log(`Guía: ${r.guide_number}`);
    console.log(`Status: ${r.status}`);
    console.log(`Notas:\n${r.notes}`);
    console.log('---------------------------');
  });
}

checkNotes();
