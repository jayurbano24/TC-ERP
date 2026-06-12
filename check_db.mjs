import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xukvydymryshksrcccku.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '...'; // Needs actual key but we can just use NEXT_PUBLIC_SUPABASE_ANON_KEY from .env.local

import * as fs from 'fs';
const envFile = fs.readFileSync('.env.local', 'utf8');
let key = '';
envFile.split('\n').forEach(line => {
  if (line.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) {
    key = line.split('=')[1].trim();
  }
});

const supabase = createClient(supabaseUrl, key);

async function test() {
  const { data, error } = await supabase
    .from('series')
    .select('serial_number, current_box_id')
    .in('serial_number', ['ASDFASDF', 'ASDFASFASD', 'AASDFASDF', 'ASDFAS']);
  console.log("Series:", data);
}

test();
