/**
 * Integración: export Excel PREDIAGNOSTICO_EQUIPOS vía reporting hex + Supabase.
 *
 * Ejecutar solo con:
 *   npm run test:integration:prediagnostico
 *
 * Precondiciones (ver docs/export-prediagnostico.md § Integración CI):
 * - NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local, o
 * - stack aislado (`npm run supabase:isolated:reset`) con las mismas vars.
 * - Opcional: RUN_PREDIAG_EXPORT_INTEGRATION=1 para forzar (falla si faltan vars).
 *
 * No forma parte de `npm run test:unit` / `npm test`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { describe, expect, it } from 'vitest';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

function supabaseIntegrationReady(): { ok: true } | { ok: false; reason: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_KEY?.trim();
  if (!url || !key) {
    return {
      ok: false,
      reason:
        'Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (.env.local o Docker aislado). Ver docs/export-prediagnostico.md',
    };
  }
  return { ok: true };
}

const ready = supabaseIntegrationReady();
const forceRun = process.env.RUN_PREDIAG_EXPORT_INTEGRATION === '1';

describe('export prediagnostico all (integration)', () => {
  it('escribe PREDIAGNOSTICO_EQUIPOS_todos.xlsx en dist', async () => {
    if (!ready.ok) {
      if (forceRun) {
        throw new Error(ready.reason);
      }
      // Condicionado: no hang de 15 min sin backend. Documentado como integración.
      console.warn(`[skip] ${ready.reason}`);
      return;
    }

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
          `${err} — Supabase no respondió (revisa status.supabase.com, VPN/red, Docker aislado, o reintenta). Use el mismo .env.local que backfill (SUPABASE_SERVICE_ROLE_KEY).`
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
