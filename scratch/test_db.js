const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://gpvocfptmsskgfpacadl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwdm9jZnB0bXNza2dmcGFjYWRsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQwMDcwNCwiZXhwIjoyMDkyOTc2NzA0fQ.ZywBVseCD2qU5zvviTulsPQPKGXs79nINSM1mIZXx-I'
);

async function run() {
  const { data: boxes, error } = await supabase
    .from('boxes')
    .select('*')
    .not('rack_location', 'in', '("DESPACHO","ELIMINADO")')
    .order('created_at', { ascending: false });

  if (error) console.error("Error fetching boxes:", error);

  const boxIds = boxes.map(b => b.id);
  console.log("Total boxes fetched:", boxIds.length);
  
  let allSeries = [];
  if (boxIds.length > 0) {
    const { data: seriesData, error: seriesError } = await supabase
      .from('series')
      .select(`
        *,
        sap_status,
        receptions (guide_number, notes, carrier, received_by, status, created_at, source),
        service_orders (id, os_label, reentry_count, sap_integration_status)
      `)
      .in('current_box_id', boxIds);
      
    if (seriesError) {
      console.error("Error fetching series:", seriesError);
    }
    if (seriesData) allSeries = seriesData;
  }
  
  console.log("Total series fetched:", allSeries.length);
  
  const box16 = boxes.find(b => b.box_code === 'BOX-16');
  if (box16) {
      console.log("Found BOX-16, id:", box16.id);
      const box16Series = allSeries.filter(s => s.current_box_id === box16.id);
      console.log("Series mapped to BOX-16 in memory:", box16Series.length);
  } else {
      console.log("BOX-16 not found in the fetched boxes!");
  }
}

run();
