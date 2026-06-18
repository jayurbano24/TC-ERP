const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://gpvocfptmsskgfpacadl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwdm9jZnB0bXNza2dmcGFjYWRsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQwMDcwNCwiZXhwIjoyMDkyOTc2NzA0fQ.ZywBVseCD2qU5zvviTulsPQPKGXs79nINSM1mIZXx-I'
);

async function check() {
  const { data, error } = await supabase
    .from('receptions')
    .select('id, guide_number, notes')
    .eq('guide_number', 'GT1W266771262D0114');
    
  console.log(JSON.stringify(data, null, 2));
}

check();
