import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gpvocfptmsskgfpacadl.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwdm9jZnB0bXNza2dmcGFjYWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MDA3MDQsImV4cCI6MjA5Mjk3NjcwNH0.T6bdu3uVW4urmuey5rY16lhd7mHzqyUssv2dLBCR-vg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase
    .from('time_logs')
    .select(`
      *, 
      employees(*, company_shifts(*)),
      time_justifications(estado)
    `)
    .limit(5);

  console.log("Error:", error);
  console.log("Data length:", data?.length);
}

test();
