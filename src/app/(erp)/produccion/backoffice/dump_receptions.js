
import { createClient } from '@supabase/supabase-browser';
// Nota: Usaremos los valores del .env.local para la conexión
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function dump() {
  console.log("--- INICIO DE RASTREO DE RECEPCIONES ---");
  const { data, error } = await supabase
    .from('receptions')
    .select('id, guide_number, status, source, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error:", error);
  } else {
    console.table(data);
  }
}
