/**
 * CHG-015 — Auditar y generar pre-diagnóstico de OS faltantes (sin prediagnosticos).
 *
 *   cd web
 *   npm run prediag:faltantes              # auditoría
 *   npm run prediag:faltantes -- --apply   # inserta sintéticos generables
 *   npm run prediag:faltantes -- --export-sin-catalogo
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { tryResolvePrediagnosticoBackfillCutoff } from '../src/modules/backoffice/prediagnostico/prediagnosticoBackfillConfig';
import { auditPrediagnosticoFaltantes } from '../src/modules/backoffice/prediagnostico/prediagnosticoBackfillFaltantes';
import { runPrediagnosticoBackfillAll } from '../src/modules/backoffice/prediagnostico/prediagnosticoBackfillService';

config({ path: path.join(process.cwd(), '.env.local'), override: true });

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const exportSinCatalogo = process.argv.includes('--export-sin-catalogo');
  const cutoffArg = process.argv.find((a) => a.startsWith('--cutoff='))?.split('=')[1];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceKey) {
    console.error('[prediag:faltantes] Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
    process.exit(1);
  }

  const cutoffIso =
    cutoffArg?.trim() ||
    process.env.PREDIAG_BACKFILL_CUTOFF?.trim() ||
    tryResolvePrediagnosticoBackfillCutoff()?.toISOString() ||
    '2027-01-01T06:00:00Z';
  const cutoff = new Date(cutoffIso);
  if (Number.isNaN(cutoff.getTime())) {
    console.error('[prediag:faltantes] Fecha cutoff inválida:', cutoffIso);
    process.exit(1);
  }
  if (!process.env.PREDIAG_BACKFILL_CUTOFF?.trim() && !cutoffArg) {
    console.warn(
      '[prediag:faltantes] Sin PREDIAG_BACKFILL_CUTOFF en .env.local — usando default ops 2027-01-01T06:00:00Z (override: --cutoff=ISO)',
    );
  }
  const db = createClient(url, serviceKey, { auth: { persistSession: false } });

  console.log(`[prediag:faltantes] Auditoría · cutoff ${cutoff.toISOString()}`);
  const audit = await auditPrediagnosticoFaltantes(db, cutoff);
  console.log(
    JSON.stringify(
      {
        totalSinPrediag: audit.totalSinPrediag,
        generable: audit.generable,
        sinCatalogo: audit.sinCatalogo,
      },
      null,
      2,
    ),
  );

  if (exportSinCatalogo && audit.sinCatalogoRows.length > 0) {
    const outDir = path.join(process.cwd(), 'dist');
    fs.mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const outPath = path.join(outDir, `PREDIAG_FALTANTES_SIN_CATALOGO_${stamp}.csv`);
    const headers = [
      'service_order_id',
      'serial',
      'model_id',
      'brand_id',
      'technology_id',
      'ingress_at',
      'current_status',
    ] as const;
    const lines = [
      headers.join(','),
      ...audit.sinCatalogoRows.map((r) =>
        [
          r.serviceOrderId,
          r.serial,
          r.modelId,
          r.brandId,
          r.techId,
          r.ingressAt,
          r.currentStatus,
        ]
          .map((v) => escapeCsvCell(v))
          .join(','),
      ),
    ];
    fs.writeFileSync(outPath, `\ufeff${lines.join('\n')}`, 'utf8');
    console.log(`[prediag:faltantes] CSV sin catálogo → ${outPath}`);
  }

  if (audit.generable === 0) {
    console.log('[prediag:faltantes] Nada generable. Revise catálogo / modelo (253) o corte T0.');
    if (!apply) return;
  }

  if (!apply) {
    console.log('[prediag:faltantes] Para insertar: npm run prediag:faltantes -- --apply');
    return;
  }

  console.log('[prediag:faltantes] Apply runAll…');
  const result = await runPrediagnosticoBackfillAll(db, {
    dryRun: false,
    cutoff,
    asOf: new Date(),
    confirmApply: true,
    maxBatches: 500,
    limit: 500,
    actorUserId: null,
  });

  console.log(
    JSON.stringify(
      {
        completed: result.completed,
        batchesRun: result.batchesRun,
        aggregates: result.aggregates,
        errors: result.errorMessages.slice(0, 10),
      },
      null,
      2,
    ),
  );

  if (!result.completed) {
    console.warn('[prediag:faltantes] Incompleto — relanzar el mismo comando --apply');
    process.exit(2);
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
