/**
 * Apply backfill CHG-015 (service role vía .env.local).
 * npm test -- --run src/scripts/run-prediagnostico-backfill-apply.test.ts
 *
 * Env opcional: PREDIAG_BACKFILL_CUTOFF=2027-01-01T00:00:00-06:00
 * Progreso en terminal: una línea por lote ([prediag-backfill apply] …). Desactivar: PREDIAG_BACKFILL_PROGRESS=0
 */
import path from 'node:path';
import { config } from 'dotenv';
import { describe, expect, it } from 'vitest';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

describe('apply prediagnostico backfill CHG-015', () => {
  it(
    'inserta prediagnosticos históricos (runAll)',
    async () => {
      const cutoffIso =
        process.env.PREDIAG_BACKFILL_CUTOFF?.trim() || '2027-01-01T00:00:00-06:00';
      const cutoff = new Date(cutoffIso);
      expect(Number.isNaN(cutoff.getTime())).toBe(false);

      const { getSupabaseServerClient } = await import('@/lib/supabase/server');
      const { runPrediagnosticoBackfillAll } = await import(
        '@/modules/backoffice/prediagnostico/prediagnosticoBackfillService'
      );

      const supabase = getSupabaseServerClient();
      const before = await supabase.from('prediagnosticos').select('id', { count: 'exact', head: true });

      const result = await runPrediagnosticoBackfillAll(supabase, {
        dryRun: false,
        cutoff,
        asOf: new Date(),
        confirmApply: true,
        maxBatches: 500,
        limit: 500,
        actorUserId: null,
      });

      const after = await supabase.from('prediagnosticos').select('id', { count: 'exact', head: true });

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            cutoff: result.cutoff,
            completed: result.completed,
            batchesRun: result.batchesRun,
            candidatesInBatch: result.candidatesInBatch,
            aggregates: result.aggregates,
            errors: result.errorMessages.slice(0, 5),
            prediagnosticosBefore: before.count,
            prediagnosticosAfter: after.count,
          },
          null,
          2
        )
      );

      expect(result.aggregates.errors).toBe(0);
      expect(after.count ?? 0).toBeGreaterThanOrEqual(before.count ?? 0);
      if (!result.completed) {
        // eslint-disable-next-line no-console
        console.warn(
          '[prediag-backfill] incompleto (timeout o maxBatches) — relanzar npm run backfill:prediagnostico'
        );
      }
    },
    86_400_000
  );
});
