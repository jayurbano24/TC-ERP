import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gpvocfptmsskgfpacadl.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY as string);

async function main() {
  const { data, error } = await supabase
    .from('feature_flag')
    .update({ is_enabled: false })
    .in('code', ['USE_NEW_RECEPTION_MODULE', 'USE_NEW_DESPACHO_MODULE']);

  if (error) {
    console.error('Error updating feature flags:', error);
  } else {
    console.log('Successfully turned off feature flags:', data);
  }
}

main();
