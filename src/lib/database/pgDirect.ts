import { Client } from 'pg';

/**
 * Normaliza URL de Postgres para conexiones server-side (RPC / TX).
 * - Prefiere DIRECT_URL
 * - En pooler Supabase: user `postgres.<project_ref>` (evita ENOIDENTIFIER)
 * - Quita pgbouncer=true y fuerza puerto 5432 (session mode)
 *
 * No usa `new URL().toString()` para no corromper passwords con caracteres especiales.
 */
export function getDirectDatabaseUrl(): string | null {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!raw) return null;

  let out = raw;

  const projectMatch =
    out.match(/[?&]options=project%3D([a-z0-9]+)/i) ??
    out.match(/[?&]options=project[=:]([a-z0-9]+)/i);
  const projectRef = projectMatch?.[1];

  if (
    projectRef &&
    out.includes('pooler.supabase.com') &&
    /\/\/postgres:/.test(out) &&
    !/\/\/postgres\./.test(out)
  ) {
    out = out.replace('//postgres:', `//postgres.${projectRef}:`);
  }

  out = out.replace('?pgbouncer=true', '').replace('&pgbouncer=true', '');
  out = out.replace(':6543/', ':5432/');
  return out;
}

function assertSafeSqlIdent(name: string, label: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) {
    throw new Error(`Unsafe ${label}: ${name}`);
  }
  return name;
}

function toPgParam(value: unknown): unknown {
  if (value === undefined) return null;
  if (value !== null && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

async function withDirectClient<T>(
  options: { statementTimeout?: string } | undefined,
  run: (client: Client) => Promise<T>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const connectionString = getDirectDatabaseUrl();
  if (!connectionString) {
    return { data: null, error: { message: 'NO_DATABASE_URL' } };
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const timeout = options?.statementTimeout ?? '300s';
    await client.query(`SET statement_timeout = '${timeout}'`);
    const data = await run(client);
    return { data, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { data: null, error: { message: msg } };
  } finally {
    await client.end().catch(() => undefined);
  }
}

export async function rpcViaDirectPostgres<T>(
  functionName: string,
  args: unknown[],
  options?: { statementTimeout?: string },
): Promise<{ data: T | null; error: { message: string } | null }> {
  return withDirectClient(options, async (client) => {
    const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `SELECT ${functionName}(${placeholders}) AS result`;
    const res = await client.query(sql, args);
    return (res.rows[0]?.result ?? null) as T;
  });
}

/**
 * Invoca RPC con notación nombrada (`p_x := $1`), típico de callers PostgREST.
 * `qualifiedFunctionName` debe ser `schema.fn` con identificadores seguros.
 */
export async function rpcViaDirectPostgresNamed<T>(
  qualifiedFunctionName: string,
  args: Record<string, unknown> = {},
  options?: { statementTimeout?: string },
): Promise<{ data: T | null; error: { message: string } | null }> {
  const [schema, fn] = qualifiedFunctionName.split('.');
  if (!schema || !fn || qualifiedFunctionName.split('.').length !== 2) {
    return { data: null, error: { message: `Invalid RPC name: ${qualifiedFunctionName}` } };
  }
  try {
    assertSafeSqlIdent(schema, 'schema');
    assertSafeSqlIdent(fn, 'function');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { data: null, error: { message: msg } };
  }

  const keys = Object.keys(args);
  for (const key of keys) {
    try {
      assertSafeSqlIdent(key, 'arg');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { data: null, error: { message: msg } };
    }
  }

  const values = keys.map((k) => toPgParam(args[k]));
  const callArgs =
    keys.length === 0
      ? ''
      : keys.map((k, i) => `${k} := $${i + 1}`).join(', ');
  const sql = `SELECT ${schema}.${fn}(${callArgs}) AS result`;

  return withDirectClient(options, async (client) => {
    const res = await client.query(sql, values);
    return (res.rows[0]?.result ?? null) as T;
  });
}
