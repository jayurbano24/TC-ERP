/**
 * Prueba variantes de connection string sin imprimir contraseñas.
 * Uso: node scripts/test_db_connection.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { Client } = require('pg');

function maskUrl(url) {
  if (!url) return '(vacío)';
  return url.replace(/:([^:@/]+)@/, ':***@');
}

function stripBrackets(url) {
  if (!url) return url;
  return url.replace(/:?\[([^\]]+)\]@/, ':$1@');
}

function variants() {
  const raw = {
    database_url: process.env.DATABASE_URL,
    direct_url: process.env.DIRECT_URL,
    supabase_db_url: process.env.SUPABASE_DB_URL,
  };

  const list = [];
  const add = (name, url) => {
    if (!url) return;
    list.push({ name, url });
    const noBrackets = stripBrackets(url);
    if (noBrackets !== url) {
      list.push({ name: `${name} (sin corchetes en password)`, url: noBrackets });
    }
  };

  add('DATABASE_URL', raw.database_url);
  add('DIRECT_URL', raw.direct_url);
  add('SUPABASE_DB_URL', raw.supabase_db_url);

  // Direct host explícito si hay ref
  const ref = process.env.NEXT_PUBLIC_SUPABASE_PROJECT_REF;
  const pass = stripBrackets(
    (raw.database_url || raw.direct_url || '').match(/:([^@]+)@/)?.[1] || '',
  );
  if (ref && pass && !pass.includes('[')) {
    add('Direct db.[ref].supabase.co:5432', `postgresql://postgres:${encodeURIComponent(pass)}@db.${ref}.supabase.co:5432/postgres`);
    add('Session pooler :5432', `postgresql://postgres.${ref}:${encodeURIComponent(pass)}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`);
  }

  // Deduplicar por URL
  const seen = new Set();
  return list.filter((v) => {
    if (seen.has(v.url)) return false;
    seen.add(v.url);
    return true;
  });
}

async function testOne({ name, url }) {
  const directUrl = url.replace('?pgbouncer=true', '').replace(':6543/', ':5432/');
  const client = new Client({
    connectionString: directUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  const started = Date.now();
  try {
    await client.connect();
    const who = await client.query('SELECT current_user, inet_server_addr()::text AS host, current_setting(\'statement_timeout\') AS stmt_timeout');
    const fn = await client.query(`
      SELECT
        prosrc LIKE '%_eq_stage%' AS has_v072,
        proconfig::text LIKE '%statement_timeout%' AS has_fn_timeout
      FROM pg_proc WHERE proname = 'finalize_px_reception_tx' LIMIT 1
    `);
    await client.end();
    return {
      name,
      url: maskUrl(url),
      ok: true,
      ms: Date.now() - started,
      user: who.rows[0]?.current_user,
      host: who.rows[0]?.host,
      stmtTimeout: who.rows[0]?.stmt_timeout,
      finalize: fn.rows[0] || null,
    };
  } catch (e) {
    await client.end().catch(() => undefined);
    return {
      name,
      url: maskUrl(url),
      ok: false,
      ms: Date.now() - started,
      error: `${e.code || 'ERR'}: ${e.message}`,
    };
  }
}

async function main() {
  const tests = variants();
  console.log(`Probando ${tests.length} variantes...\n`);

  const results = [];
  for (const t of tests) {
    const r = await testOne(t);
    results.push(r);
    if (r.ok) {
      console.log(`✅ ${r.name}`);
      console.log(`   ${r.url}`);
      console.log(`   user=${r.user} host=${r.host} timeout=${r.stmtTimeout} (${r.ms}ms)`);
      if (r.finalize) {
        console.log(`   finalize_px: v072=${r.finalize.has_v072} fn_timeout=${r.finalize.has_fn_timeout}`);
      }
    } else {
      console.log(`❌ ${r.name}`);
      console.log(`   ${r.url}`);
      console.log(`   ${r.error} (${r.ms}ms)`);
    }
    console.log('');
  }

  const winner = results.find((r) => r.ok);
  if (winner) {
    console.log('---');
    console.log(`Usar en .env.local (una sola línea DATABASE_URL):`);
    console.log(`DATABASE_URL=${results.find((r) => r.ok && r.name.startsWith('DATABASE_URL'))?.url || winner.url}`);
    console.log('\nRecomendación: dejar solo UNA línea DATABASE_URL (la directa :5432 que conectó).');
  } else {
    console.log('Ninguna variante conectó. Verifique la contraseña en Supabase → Settings → Database.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
