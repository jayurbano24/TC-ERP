const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const envFile = fs.readFileSync(path.resolve(__dirname, '.env.local'), 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2].replace(/\r$/, '');
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const myId = crypto.randomUUID();
  console.log("Attempting UPSERT with ID:", myId);
  const { data, error } = await supabase
    .from('boxes')
    .upsert([{ 
      id: myId, 
      box_code: 'TEST-UPSERT', 
      status: 'open',
      capacity: 50
    }]);
  
  if (error) {
    console.log("Error with upsert:", error.message);
  } else {
    console.log("Success with upsert!");
  }
}

test();
