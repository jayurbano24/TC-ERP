import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WORKSHOP_STAGE_ACTIONS,
  loadWorkshopCompletionBySeries,
  validateEquipmentPrerequisites,
} from './workshopStagePrerequisites';

type TableName = 'erp_audit_logs' | 'series';

function createPrereqSupabaseMock(opts: {
  auditRows?: Array<{ record_id: string; action: string }>;
  seriesRows?: Array<{ id: string; current_diagnostics: string[] | null }>;
}): SupabaseClient {
  const auditRows = opts.auditRows ?? [];
  const seriesRows = opts.seriesRows ?? [];

  const from = (table: TableName) => {
    const state: { ids?: string[] } = {};
    const builder = {
      select: () => builder,
      in: (column: string, values: string[]) => {
        if (column === 'record_id' || column === 'id') {
          state.ids = values.map(String);
        }
        return builder;
      },
      then: (resolve: (value: { data: unknown; error: null }) => unknown) => {
        if (table === 'erp_audit_logs') {
          const data = auditRows.filter((r) =>
            state.ids ? state.ids.includes(String(r.record_id)) : true,
          );
          return Promise.resolve(resolve({ data, error: null }));
        }
        const data = seriesRows.filter((r) =>
          state.ids ? state.ids.includes(String(r.id)) : true,
        );
        return Promise.resolve(resolve({ data, error: null }));
      },
    };
    return builder;
  };

  return { from } as unknown as SupabaseClient;
}

describe('loadWorkshopCompletionBySeries', () => {
  it('marca DIAG desde current_diagnostics cuando no hay auditoría (legado)', async () => {
    const supabase = createPrereqSupabaseMock({
      auditRows: [],
      seriesRows: [{ id: 's1', current_diagnostics: ['diag-hdmi'] }],
    });

    const completed = await loadWorkshopCompletionBySeries(supabase, ['s1']);
    const actions = completed.get('s1');

    expect(actions?.has(WORKSHOP_STAGE_ACTIONS.DIAG)).toBe(true);
    expect(actions?.has(undefined as unknown as string)).toBe(false);
  });

  it('conserva DIAG de auditoría y no depende solo de current_diagnostics', async () => {
    const supabase = createPrereqSupabaseMock({
      auditRows: [
        { record_id: 's2', action: WORKSHOP_STAGE_ACTIONS.DIAG },
      ],
      seriesRows: [{ id: 's2', current_diagnostics: null }],
    });

    const completed = await loadWorkshopCompletionBySeries(supabase, ['s2']);
    expect(completed.get('s2')?.has(WORKSHOP_STAGE_ACTIONS.DIAG)).toBe(true);
  });
});

describe('validateEquipmentPrerequisites — Reparación → QC', () => {
  it('permite REPARACIÓN COMPLETADA con diag legado sin audit aunque status siga in_workshop', async () => {
    // in_workshop NO está en pipelinePastDiag: aquí el typo DIG rompía el gate.
    const supabase = createPrereqSupabaseMock({
      auditRows: [],
      seriesRows: [{ id: 's-leg', current_diagnostics: ['d1'] }],
    });

    const completedBySeries = await loadWorkshopCompletionBySeries(supabase, ['s-leg']);
    expect(completedBySeries.get('s-leg')?.has(WORKSHOP_STAGE_ACTIONS.DIAG)).toBe(true);

    const seriesToOs = new Map<string, string | null>([['s-leg', 'os-1']]);
    const seriesStatus = new Map<string, string>([['s-leg', 'in_workshop']]);

    const check = validateEquipmentPrerequisites(
      ['s-leg'],
      seriesToOs,
      completedBySeries,
      WORKSHOP_STAGE_ACTIONS.REP,
      seriesStatus,
    );

    expect(check.ok).toBe(true);
  });

  it('en cola Reparación (in_qc) tolera ausencia de bitácora DIAG (pipeline past-diag)', () => {
    const completedBySeries = new Map<string, Set<string>>([['s-qc', new Set()]]);
    const check = validateEquipmentPrerequisites(
      ['s-qc'],
      new Map([['s-qc', 'os-1']]),
      completedBySeries,
      WORKSHOP_STAGE_ACTIONS.REP,
      new Map([['s-qc', 'in_qc']]),
    );
    expect(check.ok).toBe(true);
  });

  it('rechaza REPARACIÓN COMPLETADA sin diag ni audit ni status past-diag', async () => {
    const completedBySeries = new Map<string, Set<string>>([['s-empty', new Set()]]);
    const seriesToOs = new Map<string, string | null>([['s-empty', 'os-2']]);
    const seriesStatus = new Map<string, string>([['s-empty', 'in_workshop']]);

    const check = validateEquipmentPrerequisites(
      ['s-empty'],
      seriesToOs,
      completedBySeries,
      WORKSHOP_STAGE_ACTIONS.REP,
      seriesStatus,
    );

    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.message).toMatch(/Diagnóstico Inicial/i);
    }
  });
});
