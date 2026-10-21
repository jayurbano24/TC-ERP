import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runClassifyEquipmentBatchChunked } from './classify-equipment-batch-runner';
import type { ClassifyBatchParams } from '../../domain/types/equipment-unit.types';
import { auditClassifiedSeries, auditClassifyBatchCompleted } from '../audit';

const rpcMock = vi.fn();

vi.mock('../audit', () => ({
  auditClassifiedSeries: vi.fn().mockResolvedValue(undefined),
  auditClassifyBatchCompleted: vi.fn().mockResolvedValue(undefined),
}));

function unit(label: string) {
  return {
    main_serial: label,
    model_id: 'model-1',
    brand_id: 'brand-1',
    all_series: [label],
  };
}

function baseParams(units: ClassifyBatchParams['units']): ClassifyBatchParams {
  return {
    receptionId: '11111111-1111-1111-1111-111111111111',
    sapTransferId: '22222222-2222-2222-2222-222222222222',
    units,
    registeredBy: 'Operador Test',
    correlationId: 'corr-batch',
  };
}

describe('runClassifyEquipmentBatchChunked', () => {
  const supabase = { rpc: rpcMock } as unknown as SupabaseClient;

  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('no reintenta errores de negocio (serie duplicada)', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Serie duplicada: ABC123 ya está registrada' },
    });

    const result = await runClassifyEquipmentBatchChunked(supabase, baseParams([unit('ABC123')]));

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/ABC123|orden de servicio/i);
  });

  it('timeout persistente: exactamente 3 RPC y sin auditoría', async () => {
    vi.useFakeTimers();
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'upstream request timeout' },
    });

    const promise = runClassifyEquipmentBatchChunked(supabase, baseParams([unit('T1')]));
    await vi.runAllTimersAsync();
    await promise;

    expect(rpcMock).toHaveBeenCalledTimes(3);
    const ids = rpcMock.mock.calls.map((c) => c[1].p_correlation_id);
    expect(ids).toEqual(['corr-batch:u1:try1', 'corr-batch:u1:try2', 'corr-batch:u1:try3']);
    expect(vi.mocked(auditClassifiedSeries)).not.toHaveBeenCalled();
    expect(vi.mocked(auditClassifyBatchCompleted)).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('detiene equipos siguientes si uno falla sin data', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: {
          service_orders: [{ id: 'os-1' }],
          series_ids: ['s1'],
          units_processed: 1,
          units_skipped: 0,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'Not authenticated' },
      });

    const result = await runClassifyEquipmentBatchChunked(
      supabase,
      baseParams([unit('U1'), unit('U2'), unit('U3')]),
    );

    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(result.data).toHaveLength(1);
    expect(result.unitsProcessed).toBe(1);
    expect(result.error).toMatch(/permiso|autentic/i);
  });

  it('combina resultados parciales (data + skippedErrors)', async () => {
    rpcMock
      .mockResolvedValueOnce({
        data: {
          service_orders: [{ id: 'os-1' }],
          series_ids: ['s1'],
          units_processed: 1,
          units_skipped: 0,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          service_orders: [],
          series_ids: [],
          units_processed: 0,
          units_skipped: 1,
          errors: [{ main_serial: 'U2', error: 'Serie duplicada: U2' }],
        },
        error: null,
      });

    const result = await runClassifyEquipmentBatchChunked(
      supabase,
      baseParams([unit('U1'), unit('U2')]),
    );

    expect(result.data).toHaveLength(1);
    expect(result.skippedErrors).toHaveLength(1);
    expect(result.unitsProcessed).toBe(1);
    expect(result.unitsSkipped).toBe(1);
    expect(result.error).toMatch(/duplicad|U2/i);
  });
});
