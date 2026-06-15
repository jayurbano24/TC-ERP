const { Client } = require('pg');
const fs = require('fs');

async function run() {
  const connectionString = "postgresql://postgres.gpvocfptmsskgfpacadl:qv4Qlca3pDqjEXZP@aws-1-us-west-2.pooler.supabase.com:5432/postgres";
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log("Connected to database successfully.");
    
    const sql = fs.readFileSync('supabase-schema.sql', 'utf8');
    await client.query(sql);
    console.log("SQL executed successfully.");
    
  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await client.end();
  }
}

run();
