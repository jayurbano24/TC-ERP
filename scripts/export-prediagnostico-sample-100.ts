/**
 * Muestra contractual: 100 filas de pre-diagnóstico (formato SCA).
 *
 *   cd web
 *   npm run export:prediagnostico:sample100
 *
 * Salida: web/dist/PREDIAGNOSTICO_EQUIPOS_muestra_100.xlsx
 */
import path from 'node:path';
import { config } from 'dotenv';
import { safeWriteExportFile } from './lib/safeWriteExportFile';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error('[sample100] Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

  const { generateReportHex } = await import('../src/modules/reporting/factory');

  const result = await generateReportHex({
    reportCode: 'PREDIAGNOSTICO_EQUIPOS',
    format: 'XLSX',
    filters: { allData: true, maxRows: 100 },
    userId: null,
    userName: 'script-sample100',
  });

  if (!result.success) {
    console.error('[sample100] Error:', result.error);
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), 'dist');
  const outFile = safeWriteExportFile(
    path.join(outDir, 'PREDIAGNOSTICO_EQUIPOS_muestra_100.xlsx'),
    result.buffer
  );

  console.log(`[sample100] OK · ${result.rowCount} filas`);
  console.log(`[sample100] ${outFile}`);
}

main().catch((err) => {
  console.error('[sample100] Falló:', err instanceof Error ? err.message : err);
  process.exit(1);
});
