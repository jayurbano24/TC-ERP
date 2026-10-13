import type { OntRun } from './types';
import { isNotRunVerdict } from './ontRunVerdict';

export function tallyOntRunVerdicts(rows: OntRun[]): {
  pass: number;
  fail: number;
  notRun: number;
  certified: number;
} {
  let pass = 0;
  let fail = 0;
  let notRun = 0;
  for (const run of rows) {
    const v = run.verdict.toUpperCase();
    if (v === 'PASS') pass += 1;
    else if (v === 'FAIL') fail += 1;
    else if (isNotRunVerdict(run.verdict)) notRun += 1;
  }
  return { pass, fail, notRun, certified: pass + fail };
}
