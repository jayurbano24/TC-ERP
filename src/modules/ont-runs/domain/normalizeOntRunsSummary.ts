import type { OntRunsDailyCertifiedPoint, OntRunsVerdictSummary } from './types';

export function coerceOntRunCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

type OntRunsVerdictSummaryInput = Partial<Omit<OntRunsVerdictSummary, 'daily'>> & {
  daily?: Partial<OntRunsDailyCertifiedPoint>[];
};

export function normalizeOntRunsVerdictSummary(
  partial: OntRunsVerdictSummaryInput | null | undefined,
  totalFallback = 0
): OntRunsVerdictSummary {
  const pass = coerceOntRunCount(partial?.pass);
  const fail = coerceOntRunCount(partial?.fail);
  const todayPass = coerceOntRunCount(partial?.todayPass);
  const todayFail = coerceOntRunCount(partial?.todayFail);

  const daily: OntRunsDailyCertifiedPoint[] = (partial?.daily ?? []).map((point: Partial<OntRunsDailyCertifiedPoint>) => {
    const dayPass = coerceOntRunCount(point.pass);
    const dayFail = coerceOntRunCount(point.fail);
    return {
      date: point.date ?? '',
      pass: dayPass,
      fail: dayFail,
      certified: coerceOntRunCount(point.certified ?? dayPass + dayFail),
    };
  });

  return {
    total: coerceOntRunCount(partial?.total ?? totalFallback),
    pass,
    fail,
    notRun: coerceOntRunCount(partial?.notRun),
    todayPass,
    todayFail,
    todayCertified: coerceOntRunCount(partial?.todayCertified ?? todayPass + todayFail),
    daily,
  };
}
