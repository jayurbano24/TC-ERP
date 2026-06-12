
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  console.log("Checking last 50 receptions...");
  const { data, error } = await supabase
    .from('receptions')
    .select('id, guide_number, status, source, notes, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error(error);
    return;
  }

  data.forEach(r => {
    if (r.notes?.includes('Backoffice_Category')) {
        console.log(`ID: ${r.id} | Guide: ${r.guide_number} | Status: ${r.status} | Source: ${r.source}`);
        console.log(`Notes: ${r.notes}`);
        console.log('---');
    }
  });
}

checkData();
