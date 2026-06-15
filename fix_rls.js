const { Client } = require('pg');

async function run() {
  const connectionString = "postgresql://postgres.gpvocfptmsskgfpacadl:[809Fidelina]@aws-1-us-west-2.pooler.supabase.com:5432/postgres";
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Disable RLS or create public policies
    await client.query(`
      ALTER TABLE public.log_orden_servicio DISABLE ROW LEVEL SECURITY;
      ALTER TABLE public.log_equipo DISABLE ROW LEVEL SECURITY;
    `);
    
    console.log("RLS disabled on log_orden_servicio and log_equipo successfully.");
  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await client.end();
  }
}

run();
