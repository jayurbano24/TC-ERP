const { Client } = require('pg');

async function run() {
  const connectionString = "postgresql://postgres.gpvocfptmsskgfpacadl:%5B809Fidelina%5D@aws-1-us-west-2.pooler.supabase.com:5432/postgres";
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log("Connected to database successfully.");
    
    const sql = `
      CREATE SEQUENCE IF NOT EXISTS box_code_seq START 16;
      
      CREATE OR REPLACE FUNCTION next_box_code()
      RETURNS integer AS $$
      BEGIN
        RETURN nextval('box_code_seq');
      END;
      $$ LANGUAGE plpgsql;
    `;
    
    await client.query(sql);
    console.log("Sequence and function created successfully.");
    
  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await client.end();
  }
}

run();
