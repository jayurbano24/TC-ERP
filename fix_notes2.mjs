import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vtvuuvjddcqqixokwldy.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  const { data, error } = await supabase.from('receptions').select('id, notes, carrier').eq('source', 'px');
  if (error) {
    console.error(error);
    return;
  }
  for (let d of data) {
    let newNotes = d.notes || '';
    let updated = false;
    if (!newNotes.includes('Backoffice_Tech:')) {
      newNotes += '\nBackoffice_Tech: EMTA';
      updated = true;
    }
    if (updated) {
      const { error: updateError } = await supabase.from('receptions').update({notes: newNotes}).eq('id', d.id);
      if (updateError) {
         console.error('Error updating', d.id, updateError);
      } else {
         console.log('Fixed Tech for', d.id);
      }
    }
  }
}
fix();
