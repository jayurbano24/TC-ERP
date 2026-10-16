/**
 * Export por rango de fechas (CLI / PowerShell).
 *
 *   PREDIAG_EXPORT_FROM=2026-01-01 PREDIAG_EXPORT_TO=2026-03-31 npx tsx scripts/export-prediagnostico-range.ts
 */
import path from 'node:path';
import { config } from 'dotenv';
import { safeWriteExportFile } from './lib/safeWriteExportFile';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main(): Promise<void> {
  const from = process.env.PREDIAG_EXPORT_FROM?.trim();
  const to = process.env.PREDIAG_EXPORT_TO?.trim();
  if (!from || !to) {
    console.error('[export-prediag-range] Defina PREDIAG_EXPORT_FROM y PREDIAG_EXPORT_TO (YYYY-MM-DD).');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error('[export-prediag-range] Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

  const excludeBackfill = process.env.PREDIAG_EXPORT_EXCLUDE_BACKFILL === '1';

  console.log(`[export-prediag-range] ${from} → ${to}${excludeBackfill ? ' (sin backfill)' : ''}…`);
  const t0 = Date.now();

  const { generateReportHex } = await import('../src/modules/reporting/factory');

  const result = await generateReportHex({
    reportCode: 'PREDIAGNOSTICO_EQUIPOS',
    format: 'XLSX',
    filters: { from, to, excludeBackfill },
    userId: null,
    userName: 'script-export-range',
  });

  if (!result.success) {
    console.error('[export-prediag-range] Error:', result.error);
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), 'dist');
  const outFile = safeWriteExportFile(path.join(outDir, result.filename), result.buffer);

  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`[export-prediag-range] OK · ${result.rowCount} filas · ${sec}s`);
  console.log(`[export-prediag-range] Archivo:\n${outFile}`);
}

main().catch((err) => {
  console.error('[export-prediag-range] Falló:', err instanceof Error ? err.message : err);
  process.exit(1);
});
