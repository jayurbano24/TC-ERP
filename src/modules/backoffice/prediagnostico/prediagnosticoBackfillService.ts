import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildSyntheticPrediagnostico,
  classifyPrediagBackfillTiming,
  type SyntheticPrediagnosticoPayload,
} from './prediagnosticoBackfillPlan';
import {
  catalogItemsForEquipment,
  loadPrediagnosticoBackfillCatalog,
  type PrediagnosticoBackfillCatalogContext,
} from './prediagnosticoBackfillCatalog';
import {
  isScrapStatusForBackfill,
  PREDIAG_BACKFILL_ACTOR_NAME,
  PREDIAG_BACKFILL_MAX_BATCH,
} from './prediagnosticoBackfillConfig';
import {
  listPrediagnosticoBackfillCandidates,
  type PrediagnosticoBackfillCandidate,
} from './prediagnosticoBackfillEligibleQuery';
import { insertPrediagnosticoBackfill } from './prediagnosticoService';
import { createPrediagnosticoStore } from './supabasePrediagnosticoStore';
import type { ShellClass, Verdict } from './validatePrediagnostico';

export type BackfillAggregates = {
  processed: number;
  inserted: number;
  skippedExisting: number;
  skippedNoCatalog: number;
  errors: number;
  verdict: Record<string, number>;
  shell: Record<string, number>;
  timing: Record<string, number>;
};

export type BackfillSampleRow = {
  serviceOrderId: string;
  serial: string;
  verdict: string;
  shellClass: string;
  recordedAt: string;
};

export type RunPrediagnosticoBackfillResult = {
  dryRun: boolean;
  cutoff: string;
  asOf: string;
  batchLimit: number;
  batchOffset: number;
  candidatesInBatch: number;
  aggregates: BackfillAggregates;
  samples: BackfillSampleRow[];
  errorMessages: string[];
};

function emptyAggregates(): BackfillAggregates {
  return {
    processed: 0,
    inserted: 0,
    skippedExisting: 0,
    skippedNoCatalog: 0,
    errors: 0,
    verdict: {},
    shell: {},
    timing: {},
  };
}

function bump(map: Record<string, number>, key: string) {
  map[key] = (map[key] || 0) + 1;
}

function mergeCountMaps(into: Record<string, number>, from: Record<string, number>): void {
  for (const [k, v] of Object.entries(from)) {
    into[k] = (into[k] || 0) + v;
  }
}

export function mergeBackfillAggregates(into: BackfillAggregates, from: BackfillAggregates): void {
  into.processed += from.processed;
  into.inserted += from.inserted;
  into.skippedExisting += from.skippedExisting;
  into.skippedNoCatalog += from.skippedNoCatalog;
  into.errors += from.errors;
  mergeCountMaps(into.verdict, from.verdict);
  mergeCountMaps(into.shell, from.shell);
  mergeCountMaps(into.timing, from.timing);
}

export type RunPrediagnosticoBackfillAllResult = RunPrediagnosticoBackfillResult & {
  batchesRun: number;
  completed: boolean;
};

export type PrediagnosticoBackfillBatchProgress = {
  batchesRun: number;
  maxBatches: number;
  batchOffset: number;
  candidatesInBatch: number;
  batchLimit: number;
  aggregates: BackfillAggregates;
  dryRun: boolean;
  lastBatch: boolean;
};

function shouldLogBackfillProgress(options: { progress?: boolean }): boolean {
  if (options.progress === false) return false;
  const env = process.env.PREDIAG_BACKFILL_PROGRESS?.trim().toLowerCase();
  return env !== '0' && env !== 'false' && env !== 'off';
}

function logBackfillBatchProgress(info: PrediagnosticoBackfillBatchProgress): void {
  const { aggregates: a } = info;
  const mode = info.dryRun ? 'dry-run' : 'apply';
  const tail = info.lastBatch ? ' · último lote' : '';
  // eslint-disable-next-line no-console
  console.log(
    `[prediag-backfill ${mode}] lote ${info.batchesRun}/${info.maxBatches} · offset ${info.batchOffset} · ` +
      `candidatos ${info.candidatesInBatch}/${info.batchLimit} · ` +
      `procesados ${a.processed} · insertados ${a.inserted} · ` +
      `ya existían ${a.skippedExisting} · sin catálogo ${a.skippedNoCatalog} · errores ${a.errors}${tail}`
  );
}

/** Pagina offset hasta agotar candidatos o alcanzar maxBatches (Fase 5 prod). */
export async function runPrediagnosticoBackfillAll(
  supabase: SupabaseClient,
  options: {
    dryRun: boolean;
    cutoff: Date;
    asOf?: Date;
    limit?: number;
    maxBatches?: number;
    actorUserId?: string | null;
    confirmApply?: boolean;
    /** Log por lote en stdout (default: sí; desactivar con PREDIAG_BACKFILL_PROGRESS=0). */
    progress?: boolean;
  }
): Promise<RunPrediagnosticoBackfillAllResult> {
  const maxBatches = options.maxBatches ?? 500;
  const limit = Math.min(options.limit ?? PREDIAG_BACKFILL_MAX_BATCH, PREDIAG_BACKFILL_MAX_BATCH);
  const logProgress = shouldLogBackfillProgress(options);
  let offset = 0;
  let batchesRun = 0;
  let last: RunPrediagnosticoBackfillResult | null = null;
  const merged = emptyAggregates();
  const samples: BackfillSampleRow[] = [];
  const errorMessages: string[] = [];

  if (logProgress) {
    // eslint-disable-next-line no-console
    console.log(
      `[prediag-backfill] inicio · cutoff ${options.cutoff.toISOString()} · lote ${limit} · max lotes ${maxBatches}`
    );
  }

  while (batchesRun < maxBatches) {
    const batch = await runPrediagnosticoBackfillBatch(supabase, {
      ...options,
      limit,
      offset,
    });
    last = batch;
    batchesRun += 1;
    mergeBackfillAggregates(merged, batch.aggregates);
    for (const msg of batch.errorMessages) {
      if (errorMessages.length < 50) errorMessages.push(msg);
    }
    for (const row of batch.samples) {
      if (samples.length < 10) samples.push(row);
    }
    const lastBatch = batch.candidatesInBatch < limit;
    if (logProgress) {
      logBackfillBatchProgress({
        batchesRun,
        maxBatches,
        batchOffset: offset,
        candidatesInBatch: batch.candidatesInBatch,
        batchLimit: limit,
        aggregates: { ...merged },
        dryRun: options.dryRun,
        lastBatch,
      });
    }
    if (lastBatch) {
      if (logProgress) {
        // eslint-disable-next-line no-console
        console.log(
          `[prediag-backfill] fin · completed=true · lotes ${batchesRun} · insertados ${merged.inserted}`
        );
      }
      return {
        ...batch,
        batchOffset: offset,
        aggregates: merged,
        samples,
        errorMessages,
        batchesRun,
        completed: true,
      };
    }
    offset += limit;
  }

  if (!last) {
    throw new Error('runPrediagnosticoBackfillAll: sin lotes ejecutados');
  }

  if (logProgress) {
    // eslint-disable-next-line no-console
    console.log(
      `[prediag-backfill] pausa · completed=false · lotes ${batchesRun}/${maxBatches} · ` +
        `insertados ${merged.inserted} · relanzar runAll para continuar`
    );
  }

  return {
    ...last,
    batchOffset: offset,
    aggregates: merged,
    samples,
    errorMessages,
    batchesRun,
    completed: false,
  };
}

function processCandidate(
  candidate: PrediagnosticoBackfillCandidate,
  catalogCtx: PrediagnosticoBackfillCatalogContext,
  asOf: Date
): { payload: SyntheticPrediagnosticoPayload | null; skipNoCatalog: boolean } {
  const items = catalogItemsForEquipment(
    catalogCtx,
    candidate.techId,
    candidate.brandId,
    candidate.modelId
  );
  if (items.length === 0) {
    return { payload: null, skipNoCatalog: true };
  }

  const seed = candidate.serial || candidate.serviceOrderId;
  const payload = buildSyntheticPrediagnostico({
    serialOrOrderKey: seed,
    ingressAt: candidate.ingressAt,
    asOf,
    isScrap: candidate.isScrap,
    scrapReason: candidate.isScrap
      ? `Estatus ${candidate.currentStatus} en planta.`
      : undefined,
    catalogItems: items,
  });

  return { payload, skipNoCatalog: false };
}

function recordPayloadStats(
  agg: BackfillAggregates,
  payload: SyntheticPrediagnosticoPayload,
  ingressAt: Date
) {
  bump(agg.verdict, payload.verdict);
  bump(agg.shell, payload.shellClass);
  bump(agg.timing, classifyPrediagBackfillTiming(ingressAt, payload.recordedAt));
}

export async function runPrediagnosticoBackfillBatch(
  supabase: SupabaseClient,
  options: {
    dryRun: boolean;
    cutoff: Date;
    asOf?: Date;
    limit?: number;
    offset?: number;
    actorUserId?: string | null;
    confirmApply?: boolean;
  }
): Promise<RunPrediagnosticoBackfillResult> {
  const asOf = options.asOf ?? new Date();
  const limit = Math.min(options.limit ?? PREDIAG_BACKFILL_MAX_BATCH, PREDIAG_BACKFILL_MAX_BATCH);
  const offset = options.offset ?? 0;
  const agg = emptyAggregates();
  const samples: BackfillSampleRow[] = [];
  const errorMessages: string[] = [];

  if (!options.dryRun && !options.confirmApply) {
    throw new Error('Apply requiere confirmApply: true (CHG-015).');
  }

  const catalogCtx = await loadPrediagnosticoBackfillCatalog(supabase);
  const candidates = await listPrediagnosticoBackfillCandidates(
    supabase,
    options.cutoff,
    limit,
    offset,
    isScrapStatusForBackfill
  );

  const store = createPrediagnosticoStore(supabase);
  const actor = {
    userId: options.actorUserId ?? null,
    userName: PREDIAG_BACKFILL_ACTOR_NAME,
  };

  for (const candidate of candidates) {
    agg.processed += 1;
    try {
      const { payload, skipNoCatalog } = processCandidate(candidate, catalogCtx, asOf);
      if (skipNoCatalog || !payload) {
        agg.skippedNoCatalog += 1;
        continue;
      }

      recordPayloadStats(agg, payload, candidate.ingressAt);

      if (samples.length < 10) {
        samples.push({
          serviceOrderId: candidate.serviceOrderId,
          serial: candidate.serial,
          verdict: payload.verdict,
          shellClass: payload.shellClass,
          recordedAt: payload.recordedAt.toISOString(),
        });
      }

      if (options.dryRun) {
        agg.inserted += 1;
        continue;
      }

      const inserted = await insertPrediagnosticoBackfill(
        store,
        actor,
        {
          serviceOrderId: candidate.serviceOrderId,
          shellClass: payload.shellClass,
          cosmetics: payload.cosmetics,
          functionChecks: payload.functionChecks,
          verdict: payload.verdict,
          notes: payload.notes,
        },
        payload.recordedAt
      );

      if (inserted) {
        agg.inserted += 1;
      } else {
        agg.skippedExisting += 1;
      }
    } catch (err: unknown) {
      agg.errors += 1;
      const msg = err instanceof Error ? err.message : String(err);
      if (errorMessages.length < 20) {
        errorMessages.push(`${candidate.serviceOrderId}: ${msg}`);
      }
    }
  }

  return {
    dryRun: options.dryRun,
    cutoff: options.cutoff.toISOString(),
    asOf: asOf.toISOString(),
    batchLimit: limit,
    batchOffset: offset,
    candidatesInBatch: candidates.length,
    aggregates: agg,
    samples,
    errorMessages,
  };
}

/** Normaliza agregados a porcentajes 0–1 para respuesta API. */
export function backfillAggregatesToRates(agg: BackfillAggregates): {
  verdict: Record<string, number>;
  shell: Record<string, number>;
  timing: Record<string, number>;
} {
  const denom = Math.max(1, agg.processed - agg.skippedNoCatalog - agg.errors);
  const rate = (part: Record<string, number>) => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(part)) {
      out[k] = Math.round((v / denom) * 1000) / 1000;
    }
    return out;
  };
  return {
    verdict: rate(agg.verdict),
    shell: rate(agg.shell),
    timing: rate(agg.timing),
  };
}

export type { PrediagnosticoBackfillCandidate, ShellClass, Verdict };
