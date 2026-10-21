/**
 * Inventario de objetos Postgres (app + RLS) para detectar residuales tras recovery.
 */
import crypto from 'crypto';
import pg from 'pg';

const { Client } = pg;

async function inventoryRows(client) {
  const { rows } = await client.query(`
    SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public')
      AND c.relkind IN ('r','v','m','S','f','p')
    ORDER BY 1, 2, 3
  `);
  return rows.map((r) => `${r.schema}|${r.name}|${r.kind}`);
}

async function policyRows(client) {
  const { rows } = await client.query(`
    SELECT schemaname, tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
    ORDER BY schemaname, tablename, policyname
  `);
  return rows.map((r) => `${r.schemaname}|${r.tablename}|${r.policyname}|${r.cmd}`);
}

export async function captureObjectInventory(dbUrl) {
  if (/54322|54332/.test(dbUrl)) throw new Error('Forbidden port');
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const objects = await inventoryRows(client);
    const policies = await policyRows(client);
    const hash = crypto.createHash('sha256');
    for (const line of [...objects, ...policies]) hash.update(`${line}\n`);
    return {
      capturedAtUtc: new Date().toISOString(),
      objectCount: objects.length,
      policyCount: policies.length,
      fingerprint: hash.digest('hex'),
      objects,
      policies,
    };
  } finally {
    await client.end();
  }
}

export function compareInventories(before, recovered) {
  const errors = [];
  const bObj = new Set(before.objects ?? []);
  const rObj = new Set(recovered.objects ?? []);
  const extra = [...rObj].filter((x) => !bObj.has(x));
  const missing = [...bObj].filter((x) => !rObj.has(x));
  if (extra.length) errors.push(`Unexpected objects after recovery: ${extra.join('; ')}`);
  if (missing.length) errors.push(`Missing objects after recovery: ${missing.join('; ')}`);
  if (before.fingerprint !== recovered.fingerprint && extra.length === 0 && missing.length === 0) {
    errors.push('Fingerprint mismatch without object diff (policies?)');
  }
  if (errors.length) throw new Error(`Object inventory compare failed:\n${errors.join('\n')}`);
  return { ok: true };
}
