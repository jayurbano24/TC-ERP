const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Fixing notes for ADWS-54689...");
  
  const { data: recs, error: fetchError } = await supabase
    .from('receptions')
    .select('id, notes')
    .eq('guide_number', 'ADWS-54689');
    
  if (fetchError) {
    console.error("Error fetching:", fetchError);
    return;
  }
  
  if (!recs || recs.length === 0) {
    console.log("No reception found for ADWS-54689. It might have been saved differently or the user hasn't pressed confirm yet.");
    return;
  }

  for (const rec of recs) {
    if (rec.notes && rec.notes.includes('Backoffice_Agency: ')) {
      // It might be empty, like Backoffice_Agency: \n
      const newNotes = rec.notes.replace(/Backoffice_Agency:\s*\n/, 'Backoffice_Agency: Central\n');
      if (newNotes !== rec.notes) {
        const { error: upError } = await supabase.from('receptions').update({ notes: newNotes }).eq('id', rec.id);
        if (upError) console.error("Error updating:", upError);
        else console.log(`Fixed notes for reception ${rec.id}`);
      } else {
        console.log(`No change needed for reception ${rec.id}`);
      }
    }
  }

  console.log("Done.");
}

run();
