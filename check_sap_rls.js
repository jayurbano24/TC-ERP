const { Client } = require('pg');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const policies = await client.query(`
    SELECT pol.polname, pol.polcmd, pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    WHERE c.relname = 'sap_transfer_documents'
  `);

  const rls = await client.query(
    `SELECT relrowsecurity FROM pg_class WHERE relname = 'sap_transfer_documents'`
  );

  console.log('RLS enabled:', rls.rows[0]?.relrowsecurity);
  console.log('Policy count:', policies.rows.length);
  policies.rows.forEach((p) => console.log(' -', p.polname, p.polcmd, p.check_expr || p.using_expr));

  await client.end();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
