const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://gpvocfptmsskgfpacadl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwdm9jZnB0bXNza2dmcGFjYWRsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQwMDcwNCwiZXhwIjoyMDkyOTc2NzA0fQ.ZywBVseCD2qU5zvviTulsPQPKGXs79nINSM1mIZXx-I'
);

async function run() {
    const sn = 'ZTEATV45500295825';
    const { data: all_series } = await supabase
      .from('series')
      .select('id, serial_number, service_order_id, current_box_id')
      .eq('serial_number', sn);
      
    console.log(`All series for '${sn}':`);
    console.log(all_series);
}

run();
