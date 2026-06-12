const { createClient } = require('@supabase/supabase-js');

const url = 'https://gpvocfptmsskgfpacadl.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwdm9jZnB0bXNza2dmcGFjYWRsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0MDA3MDQsImV4cCI6MjA5Mjk3NjcwNH0.T6bdu3uVW4urmuey5rY16lhd7mHzqyUssv2dLBCR-vg';

const supabase = createClient(url, key);

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
    console.error("Error fetching profiles:");
    console.error(JSON.stringify(error, null, 2));
  } else {
    console.log("Data length:", data.length);
  }
}
run();
