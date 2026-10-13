import type { OntRun } from './types';

export function normalizeOntRunVerdict(verdict: string): string {
  return verdict.trim().toUpperCase();
}

export function isNotRunVerdict(verdict: string): boolean {
  const v = normalizeOntRunVerdict(verdict);
  return v === 'NOT_RUN' || v === 'NOT RUN' || v === 'NOTRUN';
}

/** Preferir fila con certificación útil al deduplicar sync duplicado. */
export function ontRunRowPriority(run: OntRun): number {
  let score = 0;
  const v = normalizeOntRunVerdict(run.verdict);
  if (v === 'PASS') score += 100;
  else if (v === 'FAIL') score += 60;
  else if (isNotRunVerdict(run.verdict)) score += 5;

  const rj = run.reportJson;
  if (rj && typeof rj === 'object') {
    score += 15;
    const sheet = rj.certificate_sheet;
    if (sheet && typeof sheet === 'object') score += 40;
    try {
      score += Math.min(20, Math.floor(JSON.stringify(rj).length / 5000));
    } catch {
      /* ignore */
    }
  }
  return score;
}

export function pickPreferredOntRun(a: OntRun, b: OntRun): OntRun {
  return ontRunRowPriority(b) > ontRunRowPriority(a) ? b : a;
}
