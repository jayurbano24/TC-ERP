const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres.gpvocfptmsskgfpacadl:[809Fidelina]@aws-1-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true';

const client = new Client({
  connectionString: connectionString,
});

async function run() {
  try {
    await client.connect();
    console.log("Connected to PostgreSQL");
    
    const sqlFile = path.join(__dirname, '../supabase/migrations/022_sap_integration.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log("Executing SQL...");
    await client.query(sql);
    console.log("Migration executed successfully!");
    
  } catch (error) {
    console.error("Error executing migration:", error);
  } finally {
    await client.end();
  }
}

run();
