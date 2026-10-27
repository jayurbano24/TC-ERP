import { describe, expect, it } from 'vitest';
import {
  formatWorkshopStageHistoryLabel,
  hasNonEmptyCatalogIdList,
  resolveWorkshopHistorialFlags,
} from '@/modules/workshop/shared/workshopSeriesDisplay';
import { workshopQueueCellValue } from '@/modules/workshop/shared/workshopQueueColumnFilters';

describe('Historial QC (RP/RC) — reparación agregada vs paso por área', () => {
  it.each([
    {
      name: 'Reacondicionado → Reparación con reparación agregada → RP',
      hasAddedRepair: true,
      passedReacondicionado: true,
      expected: 'RP',
    },
    {
      name: 'Reparación → Reacondicionado con reparación agregada → RP',
      hasAddedRepair: true,
      passedReacondicionado: true,
      expected: 'RP',
    },
    {
      name: 'Reacondicionado únicamente sin reparación → RC',
      hasAddedRepair: false,
      passedReacondicionado: true,
      expected: 'RC',
    },
    {
      name: 'Área Reparación sin reparación agregada → Reacondicionado → RC',
      hasAddedRepair: false,
      passedReacondicionado: true,
      expected: 'RC',
    },
    {
      name: 'Sin reparación ni reacondicionado → vacío',
      hasAddedRepair: false,
      passedReacondicionado: false,
      expected: '',
    },
    {
      name: 'Solo reparación agregada (sin RC) → RP',
      hasAddedRepair: true,
      passedReacondicionado: false,
      expected: 'RP',
    },
  ])('$name', ({ hasAddedRepair, passedReacondicionado, expected }) => {
    const flags = resolveWorkshopHistorialFlags({
      hasAddedRepair,
      passedReacondicionado,
    });
    expect(formatWorkshopStageHistoryLabel(flags)).toBe(expected);
  });

  it('retorno a Reacondicionado no reemplaza RP cuando hay reparación agregada', () => {
    const flags = resolveWorkshopHistorialFlags({
      hasAddedRepair: true,
      passedReacondicionado: true,
    });
    expect(flags.passed_repair).toBe(true);
    expect(flags.passed_reacond).toBe(true);
    expect(formatWorkshopStageHistoryLabel(flags)).toBe('RP');
  });

  it('haber visitado Reparación sin IDs de catálogo no cuenta como reparación agregada', () => {
    expect(hasNonEmptyCatalogIdList([])).toBe(false);
    expect(hasNonEmptyCatalogIdList(null)).toBe(false);
    expect(hasNonEmptyCatalogIdList([''])).toBe(false);
    expect(hasNonEmptyCatalogIdList(['rep-1'])).toBe(true);
    expect(
      formatWorkshopStageHistoryLabel(
        resolveWorkshopHistorialFlags({
          hasAddedRepair: hasNonEmptyCatalogIdList([]),
          passedReacondicionado: true,
        }),
      ),
    ).toBe('RC');
  });

  it('valor visible Hist. y valor filtrable (columna hist) coinciden', () => {
    const helpers = {
      seriesAt: () => null,
      ingressLabel: () => '—',
    };
    const cases = [
      { passed_repair: true, passed_reacond: true, expected: 'RP' },
      { passed_repair: false, passed_reacond: true, expected: 'RC' },
      { passed_repair: false, passed_reacond: false, expected: '—' },
    ] as const;

    for (const c of cases) {
      const row = {
        dbId: 's1',
        passed_repair: c.passed_repair,
        passed_reacond: c.passed_reacond,
      };
      const visible = formatWorkshopStageHistoryLabel(row) || '—';
      const filterable = workshopQueueCellValue(row, 'hist', helpers);
      expect(visible).toBe(c.expected);
      expect(filterable).toBe(visible);
    }
  });
});
