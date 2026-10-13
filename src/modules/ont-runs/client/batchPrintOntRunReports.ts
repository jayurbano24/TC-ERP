import type { OntRun } from '../domain/types';
import { isNotRunVerdict } from '../domain/ontRunVerdict';
import { printOntRunReport } from './printOntRunReport';

const BATCH_DELAY_MS = 900;
const MAX_BATCH = 25;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Abre ventanas de impresión PDF en serie (evita bloqueo agresivo del navegador). */
export async function batchPrintOntRunReports(
  runs: OntRun[],
  options?: { skipNotRun?: boolean; max?: number }
): Promise<{ printed: number; skipped: number }> {
  const max = Math.min(options?.max ?? MAX_BATCH, MAX_BATCH);
  const skipNotRun = options?.skipNotRun ?? true;

  let printed = 0;
  let skipped = 0;

  for (const run of runs.slice(0, max)) {
    if (skipNotRun && isNotRunVerdict(run.verdict)) {
      skipped += 1;
      continue;
    }
    await printOntRunReport(run);
    printed += 1;
    if (printed < max) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return { printed, skipped };
}
