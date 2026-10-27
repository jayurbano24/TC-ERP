import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  WorkshopTreatmentEvidenceLoadError,
  loadWorkshopTreatmentEvidence,
  loadWorkshopTreatmentEvidenceFromPages,
  type WorkshopAuditEvidenceRow,
} from './workshopTreatmentEvidence';

const REPAIR_ACTION = 'REPARACIÓN COMPLETADA';
const REACOND_ACTION = 'REACONDICIONADO COMPLETADO';

describe('loadWorkshopTreatmentEvidenceFromPages', () => {
  it('encuentra una reparación ubicada después del antiguo tope de 4,000 filas', async () => {
    const rows: WorkshopAuditEvidenceRow[] = Array.from({ length: 4_001 }, (_, index) => ({
      id: `audit-${String(index).padStart(5, '0')}`,
      record_id: 'series-noise',
      action: REACOND_ACTION,
      new_values: {},
      created_at: '2026-10-26T00:00:00.000Z',
    }));
    rows[4_000] = {
      id: 'audit-04000',
      record_id: 'series-target',
      action: REPAIR_ACTION,
      new_values: { repairs: ['repair-1'] },
      created_at: '2026-10-26T00:00:00.000Z',
    };

    const evidence = await loadWorkshopTreatmentEvidenceFromPages({
      seriesIds: ['series-target', 'series-noise'],
      pageSize: 1_000,
      readPage: async ({ from, to }) => ({
        rows: rows.slice(from, to + 1),
        error: null,
      }),
    });

    expect(evidence.get('series-target')).toEqual({
      hasAddedRepair: true,
      passedReacondicionado: false,
    });
  });

  it('conserva ambas evidencias para que la política canónica resuelva RP', async () => {
    const rows: WorkshopAuditEvidenceRow[] = [
      {
        id: 'audit-1',
        record_id: 'series-1',
        action: REACOND_ACTION,
        new_values: { items: ['clean-1'] },
        created_at: '2026-10-25T10:00:00.000Z',
      },
      {
        id: 'audit-2',
        record_id: 'series-1',
        action: REPAIR_ACTION,
        new_values: { items: ['repair-1'] },
        created_at: '2026-10-26T10:00:00.000Z',
      },
    ];

    const evidence = await loadWorkshopTreatmentEvidenceFromPages({
      seriesIds: ['series-1'],
      pageSize: 1,
      readPage: async ({ from, to }) => ({
        rows: rows.slice(from, to + 1),
        error: null,
      }),
    });

    expect(evidence.get('series-1')).toEqual({
      hasAddedRepair: true,
      passedReacondicionado: true,
    });
  });

  it('no considera RP una visita a Reparación sin IDs agregados', async () => {
    const evidence = await loadWorkshopTreatmentEvidenceFromPages({
      seriesIds: ['series-1'],
      pageSize: 100,
      readPage: async () => ({
        rows: [
          {
            id: 'audit-1',
            record_id: 'series-1',
            action: REPAIR_ACTION,
            new_values: {},
            created_at: '2026-10-26T10:00:00.000Z',
          },
          {
            id: 'audit-2',
            record_id: 'series-1',
            action: REACOND_ACTION,
            new_values: {},
            created_at: '2026-10-26T11:00:00.000Z',
          },
        ],
        error: null,
      }),
    });

    expect(evidence.get('series-1')).toEqual({
      hasAddedRepair: false,
      passedReacondicionado: true,
    });
  });

  it('falla con contexto y no devuelve evidencia parcial si una página falla', async () => {
    await expect(
      loadWorkshopTreatmentEvidenceFromPages({
        seriesIds: ['series-1'],
        pageSize: 1,
        readPage: async ({ from }) =>
          from === 0
            ? {
                rows: [
                  {
                    id: 'audit-1',
                    record_id: 'series-1',
                    action: REACOND_ACTION,
                    new_values: {},
                    created_at: '2026-10-26T10:00:00.000Z',
                  },
                ],
                error: null,
              }
            : { rows: [], error: { message: 'database unavailable' } },
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<WorkshopTreatmentEvidenceLoadError>>({
        name: 'WorkshopTreatmentEvidenceLoadError',
        pageFrom: 1,
        seriesIds: ['series-1'],
      }),
    );
  });
});

describe('loadWorkshopTreatmentEvidence', () => {
  it('divide consultas grandes en bloques seguros y combina la evidencia por serie', async () => {
    const targetId = 'series-081';
    const seriesIds = Array.from({ length: 81 }, (_, index) =>
      `series-${String(index + 1).padStart(3, '0')}`,
    );
    const sourceRows: WorkshopAuditEvidenceRow[] = [
      {
        id: 'audit-target',
        record_id: targetId,
        action: REPAIR_ACTION,
        new_values: { repairs: ['repair-1'] },
        created_at: '2026-10-26T10:00:00.000Z',
      },
    ];

    const supabase = {
      from: () => {
        let requestedSeriesIds: string[] = [];
        const builder = {
          select: () => builder,
          in: (column: string, values: string[]) => {
            if (column === 'record_id') requestedSeriesIds = values;
            return builder;
          },
          order: () => builder,
          range: async (from: number, to: number) => {
            if (requestedSeriesIds.length > 80) {
              return { data: null, error: { message: 'too many series ids' } };
            }
            const matching = sourceRows.filter((row) =>
              requestedSeriesIds.includes(String(row.record_id)),
            );
            return { data: matching.slice(from, to + 1), error: null };
          },
        };
        return builder;
      },
    } as unknown as SupabaseClient;

    const evidence = await loadWorkshopTreatmentEvidence(supabase, seriesIds);

    expect(evidence.size).toBe(81);
    expect(evidence.get(targetId)).toEqual({
      hasAddedRepair: true,
      passedReacondicionado: false,
    });
  });
});
