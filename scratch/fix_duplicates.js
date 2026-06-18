const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://gpvocfptmsskgfpacadl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdwdm9jZnB0bXNza2dmcGFjYWRsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQwMDcwNCwiZXhwIjoyMDkyOTc2NzA0fQ.ZywBVseCD2qU5zvviTulsPQPKGXs79nINSM1mIZXx-I'
);

async function run() {
    console.log("Fetching all service orders...");
    const { data: all_orders, error } = await supabase
      .from('service_orders')
      .select('id, main_serial, reception_id, reentry_count, os_label')
      .order('created_at', { ascending: true });

    if (error) {
        console.error(error);
        return;
    }

    // Group by main_serial -> reception_id
    const grouped = {};
    for (const order of all_orders) {
        if (!order.main_serial || !order.reception_id) continue;
        const key = `${order.main_serial}_${order.reception_id}`;
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(order);
    }

    let toDelete = [];
    let toUpdate = [];

    for (const key in grouped) {
        const orders = grouped[key];
        if (orders.length > 1) {
            console.log(`Found ${orders.length} duplicate orders for ${key}`);
            // Sort by reentry_count ascending
            orders.sort((a, b) => a.reentry_count - b.reentry_count);
            
            // Keep the first one, delete the rest
            const keep = orders[0];
            const drop = orders.slice(1);
            
            console.log(`  Keeping: ${keep.os_label} (reentry: ${keep.reentry_count})`);
            console.log(`  Deleting: ${drop.map(d => d.os_label).join(', ')}`);
            
            toDelete.push(...drop.map(d => d.id));
            if (keep.reentry_count !== 1) {
                toUpdate.push(keep.id);
            }
        }
    }

    console.log(`Total to delete: ${toDelete.length}`);
    console.log(`Total to update to reentry_count=1: ${toUpdate.length}`);
    
    // Chunking deletes to avoid URI too long errors if many
    const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));

    if (toDelete.length > 0) {
        const chunks = chunkArray(toDelete, 50);
        for (const chunk of chunks) {
            const { error: delError } = await supabase.from('service_orders').delete().in('id', chunk);
            if (delError) console.error("Error deleting:", delError);
        }
        console.log("Deleted successfully.");
    }
    
    if (toUpdate.length > 0) {
        const chunks = chunkArray(toUpdate, 50);
        for (const chunk of chunks) {
            const { error: updError } = await supabase.from('service_orders').update({ reentry_count: 1 }).in('id', chunk);
            if (updError) console.error("Error updating:", updError);
        }
        console.log("Updated successfully.");
    }
}

run();
