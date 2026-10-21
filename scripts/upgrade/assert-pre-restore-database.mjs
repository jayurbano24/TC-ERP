/**
 * Gate: plataforma puede existir; objetos de aplicación no deben estar presentes pre-restore.
 * No sustituye inspección humana de volumen — complementa wipe/start.
 */
import pg from 'pg';

const APP_TABLES = [
  'public.service_orders',
  'public.series',
  'public.service_order_serial_cycles',
  'public.receptions',
  'public.boxes',
];

export async function assertPreRestoreDatabase(dbUrl) {
  if (/54322|54332/.test(dbUrl)) throw new Error('Forbidden port: use upgrade 54342 only');
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const found = [];
    for (const rel of APP_TABLES) {
      const [schema, table] = rel.split('.');
      const { rows } = await client.query(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = $2
        ) AS exists`,
        [schema, table]
      );
      if (rows[0]?.exists) {
        const { rows: c } = await client.query(`SELECT COUNT(*)::bigint AS n FROM ${rel}`);
        if (Number(c[0]?.n) > 0) found.push({ rel, count: c[0]?.n });
      }
    }
    if (found.length) {
      throw new Error(`Pre-restore gate failed — application data present: ${JSON.stringify(found)}`);
    }
    return { ok: true };
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1]?.endsWith('assert-pre-restore-database.mjs');
if (isMain) {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node assert-pre-restore-database.mjs <databaseUrl>');
    process.exit(2);
  }
  assertPreRestoreDatabase(url)
    .then(() => {
      console.log('Pre-restore gate OK');
      process.exit(0);
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
