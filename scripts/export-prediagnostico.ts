/**
 * Exporta pre-diagnóstico completo a Excel (sin Vitest, timeout largo).
 *
 * Uso:
 *   cd web
 *   npm run export:prediagnostico
 *
 * Salida:
 *   web/dist/PREDIAGNOSTICO_EQUIPOS_todos.xlsx
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error(
      '[export-prediag] Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local (mismo archivo que backfill).'
    );
    process.exit(1);
  }

  console.log('[export-prediag] Conectando a Supabase… (~8–15 min para ~80k filas)');
  const t0 = Date.now();

  const { generateReportHex } = await import('../src/modules/reporting/factory');

  const result = await generateReportHex({
    reportCode: 'PREDIAGNOSTICO_EQUIPOS',
    format: 'XLSX',
    filters: { allData: true },
    userId: null,
    userName: 'script-export',
  });

  if (!result.success) {
    console.error('[export-prediag] Error:', result.error);
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), 'dist');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, result.filename);
  fs.writeFileSync(outFile, result.buffer);

  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`[export-prediag] OK · ${result.rowCount} filas · ${sec}s`);
  console.log(`[export-prediag] Archivo:\n${outFile}`);
}

main().catch((err) => {
  console.error('[export-prediag] Falló:', err instanceof Error ? err.message : err);
  process.exit(1);
});
