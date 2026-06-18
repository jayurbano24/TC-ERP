const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://gpvocfptmsskgfpacadl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwdm9jZnB0bXNza2dmcGFjYWRsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQwMDcwNCwiZXhwIjoyMDkyOTc2NzA0fQ.ZywBVseCD2qU5zvviTulsPQPKGXs79nINSM1mIZXx-I'
);

async function run() {
  const { data: box } = await supabase.from('boxes').select('*').eq('box_code', 'BOX-16').single();
  console.log('BOX-16:', box);
}

run();
