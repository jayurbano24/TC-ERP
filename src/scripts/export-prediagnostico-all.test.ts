/**
 * Genera Excel local: npm test -- --run src/scripts/export-prediagnostico-all.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { describe, expect, it } from 'vitest';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

describe('export prediagnostico all', () => {
  it('escribe PREDIAGNOSTICO_EQUIPOS_todos.xlsx en dist', async () => {
    const { generateReportHex } = await import('@/modules/reporting/factory');

    const result = await generateReportHex({
      reportCode: 'PREDIAGNOSTICO_EQUIPOS',
      format: 'XLSX',
      filters: { allData: true },
      userId: null,
      userName: 'script-export',
    });

    if (!result.success) {
      const err = result.error || 'generateReportHex failed';
      if (/fetch failed|521|ECONNREFUSED|ETIMEDOUT/i.test(err)) {
        throw new Error(
          `${err} — Supabase no respondió (revisa status.supabase.com, VPN/red, o reintenta). Use el mismo .env.local que backfill (22 vars, SUPABASE_SERVICE_ROLE_KEY).`
        );
      }
      if (err.includes('No hay datos')) {
        const XLSX = await import('xlsx');
        const { buildPrediagnosticoExportColumns } = await import(
          '@/modules/reporting/infrastructure/providers/prediagnostico-export-catalog'
        );
        const headers = buildPrediagnosticoExportColumns([]);
        const ws = XLSX.utils.aoa_to_sheet([headers]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Equipos prediagnosticados');
        const outDir = path.join(process.cwd(), 'dist');
        fs.mkdirSync(outDir, { recursive: true });
        const outFile = path.join(outDir, 'PREDIAGNOSTICO_EQUIPOS_todos.xlsx');
        XLSX.writeFile(wb, outFile);
        // eslint-disable-next-line no-console
        console.log(`Sin filas en prediagnosticos (0). Plantilla → ${outFile}`);
        return;
      }
      throw new Error(err);
    }

    const outDir = path.join(process.cwd(), 'dist');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, result.filename);
    fs.writeFileSync(outFile, result.buffer);
    // eslint-disable-next-line no-console
    console.log(`OK ${result.rowCount} filas → ${outFile}`);
    expect(result.rowCount).toBeGreaterThanOrEqual(0);
  }, 600_000);
});
