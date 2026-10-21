/**
 * Fingerprints completos (sin LIMIT silencioso) + conjuntos de IDs.
 */
import crypto from 'crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;

export function assertUpgradeDbUrl(url) {
  if (!url) throw new Error('UPGRADE_DATABASE_URL required');
  if (/54322|54332/.test(url)) throw new Error('Forbidden port in UPGRADE_DATABASE_URL');
  if (!/54342/.test(url)) throw new Error('UPGRADE_DATABASE_URL must use port 54342');
}

const BLOCK_SIZE = 4096;

/** Lectura completa por bloques (sin LIMIT global silencioso). */
async function hashRowsBlocked(client, orderedSubquerySql, mapRow) {
  const hash = crypto.createHash('sha256');
  const sigs = [];
  let offset = 0;
  while (true) {
    const { rows } = await client.query(
      `SELECT * FROM (${orderedSubquerySql}) AS _ev LIMIT $1 OFFSET $2`,
      [BLOCK_SIZE, offset]
    );
    if (rows.length === 0) break;
    for (const row of rows) sigs.push(mapRow(row));
    offset += rows.length;
    if (rows.length < BLOCK_SIZE) break;
  }
  sigs.sort();
  for (const s of sigs) hash.update(s);
  hash.update(`|count=${sigs.length}`);
  return { fingerprint: hash.digest('hex'), count: sigs.length, ids: sigs };
}

async function hashLines(client, sql, lineFn) {
  const hash = crypto.createHash('sha256');
  const { rows } = await client.query(sql);
  const lines = rows.map(lineFn);
  lines.sort();
  for (const line of lines) hash.update(`${line}\n`);
  hash.update(`|count=${lines.length}`);
  return { fingerprint: hash.digest('hex'), count: lines.length };
}

export async function collectEvidence(client) {
  const counts = (
    await client.query(`
      SELECT json_build_object(
        'service_orders', (SELECT COUNT(*)::bigint FROM public.service_orders),
        'series', (SELECT COUNT(*)::bigint FROM public.series),
        'cycles', (SELECT COUNT(*)::bigint FROM public.service_order_serial_cycles)
      ) AS v
    `)
  ).rows[0].v;

  const serviceOrderIds = await hashRowsBlocked(
    client,
    `SELECT id::text AS id FROM public.service_orders ORDER BY id`,
    (r) => r.id
  );
  const seriesIds = await hashRowsBlocked(
    client,
    `SELECT id::text AS id FROM public.series ORDER BY id`,
    (r) => r.id
  );

  const identity = await hashRowsBlocked(
    client,
    `SELECT so.id::text AS so_id, s.id::text AS series_id
     FROM public.service_orders so
     JOIN public.series s ON s.service_order_id = so.id
     ORDER BY so.id, s.id`,
    (r) => `${r.so_id}:${r.series_id}`
  );

  const cycles = await hashRowsBlocked(
    client,
    `SELECT serial_number, service_order_id::text AS service_order_id, cycle_no::text AS cycle_no,
            coalesce(linked_at::text,'') AS linked_at, coalesce(unlinked_at::text,'') AS unlinked_at
     FROM public.service_order_serial_cycles
     ORDER BY serial_number, service_order_id, cycle_no`,
    (r) => `${r.serial_number}|${r.service_order_id}|${r.cycle_no}|${r.linked_at}|${r.unlinked_at}`
  );

  const { rows: rlsRows } = await client.query(`
    SELECT schemaname, tablename, policyname, cmd, coalesce(qual,'') AS qual, coalesce(with_check,'') AS wc
    FROM pg_policies WHERE schemaname = 'public'
    ORDER BY tablename, policyname
  `);
  const rlsHash = crypto.createHash('sha256');
  for (const r of rlsRows) {
    rlsHash.update(`${r.schemaname}.${r.tablename}|${r.policyname}|${r.cmd}|${r.qual}|${r.wc}\n`);
  }

  const { rows: grantRows } = await client.query(`
    SELECT grantee, privilege_type
    FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public' AND routine_name = 'classify_equipment_batch_tx'
    ORDER BY grantee, privilege_type
  `);
  const grantsHash = crypto.createHash('sha256');
  for (const g of grantRows) grantsHash.update(`${g.grantee}:${g.privilege_type}\n`);

  const sequences = await hashLines(
    client,
    `SELECT sequence_name, start_value, minimum_value, maximum_value, increment, last_value
     FROM information_schema.sequences WHERE sequence_schema = 'public'
     ORDER BY sequence_name`,
    (r) =>
      `${r.sequence_name}|${r.start_value}|${r.minimum_value}|${r.maximum_value}|${r.increment}|${r.last_value}`
  );

  const routines_public = await hashLines(
    client,
    `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, r.rolname AS owner
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     JOIN pg_roles r ON r.oid = p.proowner
     WHERE n.nspname = 'public'
     ORDER BY p.proname, args`,
    (r) => `${r.proname}(${r.args})|${r.owner}`
  );

  const table_owners = await hashLines(
    client,
    `SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    (r) => `${r.tablename}|${r.tableowner}`
  );

  return {
    counts,
    serviceOrderIds,
    seriesIds,
    identity,
    cycles,
    rls_policies: { fingerprint: rlsHash.digest('hex'), count: rlsRows.length },
    grants_classify: { fingerprint: grantsHash.digest('hex'), count: grantRows.length },
    sequences,
    routines_public,
    table_owners,
  };
}

export async function exportEvidencePhase(phase, outDir) {
  const dbUrl = process.env.UPGRADE_DATABASE_URL;
  assertUpgradeDbUrl(dbUrl);
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const payload = {
      phase,
      capturedAtUtc: new Date().toISOString(),
      dbUrlRedacted: dbUrl.replace(/:[^:@]+@/, ':***@'),
      evidence: await collectEvidence(client),
    };
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${phase}.json`);
    const tmp = `${outPath}.tmp`;
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    fs.renameSync(tmp, outPath);
    return outPath;
  } finally {
    await client.end();
  }
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const phase = process.argv[2];
  const outDir = process.argv[3];
  if (!phase || !outDir) {
    console.error('Usage: node export-evidence.mjs <phase> <outDir>');
    process.exit(2);
  }
  exportEvidencePhase(phase, outDir)
    .then((p) => {
      console.log(`Wrote ${p}`);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
