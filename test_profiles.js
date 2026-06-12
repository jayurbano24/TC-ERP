const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const content = fs.readFileSync('src/lib/database/config.ts', 'utf-8');
const urlMatch = content.match(/SUPABASE_URL\s*=\s*'([^']+)'/);
const keyMatch = content.match(/SUPABASE_ANON_KEY\s*=\s*'([^']+)'/);

if (!urlMatch || !keyMatch) {
  console.log('Could not find url or key');
  process.exit(1);
}

const supabase = createClient(urlMatch[1], keyMatch[1]);

async function run() {
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      is_active,
      created_at,
      user_roles ( role )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Error:", error.message, error.details, error.hint);
  } else {
    console.log("Data length:", data.length);
  }
}
run();
