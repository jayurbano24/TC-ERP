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
import path from 'node:path';
import { config } from 'dotenv';
import { safeWriteExportFile } from './lib/safeWriteExportFile';

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
  console.log('[export-prediag] No cierre esta ventana. Terminó cuando vea: OK · N filas · archivo .xlsx');
  const t0 = Date.now();

  const heartbeat = setInterval(() => {
    const min = Math.floor((Date.now() - t0) / 60000);
    const sec = Math.floor((Date.now() - t0) / 1000) % 60;
    console.log(
      `[export-prediag] Sigue en progreso… ${min}:${String(sec).padStart(2, '0')} transcurrido (normal hasta ~15 min)`
    );
  }, 60_000);

  const { generateReportHex } = await import('../src/modules/reporting/factory');

  let result: Awaited<ReturnType<typeof generateReportHex>>;
  try {
    result = await generateReportHex({
      reportCode: 'PREDIAGNOSTICO_EQUIPOS',
      format: 'XLSX',
      filters: { allData: true },
      userId: null,
      userName: 'script-export',
    });
  } finally {
    clearInterval(heartbeat);
  }

  if (!result.success) {
    console.error('[export-prediag] Error:', result.error);
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), 'dist');
  const outFile = safeWriteExportFile(path.join(outDir, result.filename), result.buffer);

  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  console.log('');
  console.log('========== EXPORT TERMINADO ==========');
  console.log(`[export-prediag] OK · ${result.rowCount} filas · ${sec}s`);
  console.log(`[export-prediag] Archivo:\n${outFile}`);
  console.log('====================================');
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  if (/EBUSY|resource busy|locked/i.test(msg)) {
    console.error(
      '[export-prediag] Falló: el Excel está abierto. Cierre PREDIAGNOSTICO_EQUIPOS_todos.xlsx en Excel y ejecute de nuevo.'
    );
  } else {
    console.error('[export-prediag] Falló:', msg);
  }
  process.exit(1);
});
