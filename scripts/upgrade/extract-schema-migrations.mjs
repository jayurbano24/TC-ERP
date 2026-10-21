/**
 * Extrae supabase_migrations.schema_migrations de la base restaurada → JSON vinculado al backup.
 * Ejecutar solo cuando exista copia autorizada (no en CI por defecto).
 */
import fs from 'node:fs';
import pg from 'pg';

export async function extractSchemaMigrations(dbUrl, outPath, meta = {}) {
  if (/54322|54332/.test(dbUrl)) throw new Error('Forbidden port');
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version`
    );
    const payload = {
      extractedAtUtc: new Date().toISOString(),
      sourceBackupManifest: meta.sourceBackupManifest ?? null,
      versions: rows.map((r) => String(r.version)),
      rows,
    };
    fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return payload;
  } finally {
    await client.end();
  }
}
