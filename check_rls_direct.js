const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const connectionString = "postgresql://postgres.gpvocfptmsskgfpacadl:qv4Qlca3pDqjEXZP@aws-1-us-west-2.pooler.supabase.com:5432/postgres";
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    const res = await client.query(`
      SELECT relname, relrowsecurity 
      FROM pg_class 
      WHERE relname IN ('log_orden_servicio', 'log_equipo');
    `);
    
    console.table(res.rows);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.end();
  }
}

run();
