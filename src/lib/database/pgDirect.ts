import { Client } from 'pg';

/** URL directa a Postgres (puerto 5432), sin pooler transaction-mode. */
export function getDirectDatabaseUrl(): string | null {
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!raw) return null;
  return raw.replace('?pgbouncer=true', '').replace(':6543/', ':5432/');
}

export async function rpcViaDirectPostgres<T>(
  functionName: string,
  args: unknown[],
  options?: { statementTimeout?: string },
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
    const placeholders = args.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `SELECT ${functionName}(${placeholders}) AS result`;
    const res = await client.query(sql, args);
    return { data: (res.rows[0]?.result ?? null) as T, error: null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { data: null, error: { message: msg } };
  } finally {
    await client.end().catch(() => undefined);
  }
}
