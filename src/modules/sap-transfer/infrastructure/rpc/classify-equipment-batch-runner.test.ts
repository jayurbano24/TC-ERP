import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { runClassifyEquipmentBatchChunked } from './classify-equipment-batch-runner';
import type { ClassifyBatchParams } from '../../domain/types/equipment-unit.types';
import { auditClassifiedSeries, auditClassifyBatchCompleted } from '../audit';
import { CLASSIFY_TIMEOUT_SAFE_MESSAGE } from './classify-batch-reconcile';

const rpcMock = vi.fn();
const maybeSingleMock = vi.fn();
const limitMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const eqChain = {
  eq: vi.fn(function eq(this: unknown) {
    return eqChain;
  }),
  limit: limitMock,
};
const selectMock = vi.fn(() => eqChain);
const fromMock = vi.fn(() => ({ select: selectMock }));

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
  const supabase = { rpc: rpcMock, from: fromMock } as unknown as SupabaseClient;

  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockClear();
    selectMock.mockClear();
    maybeSingleMock.mockReset();
    eqChain.eq.mockClear();
    limitMock.mockClear();
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
  });

  it('no reintenta errores de negocio (serie duplicada)', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'Serie duplicada: ABC123 ya está registrada', code: 'P0001' },
    });

    const result = await runClassifyEquipmentBatchChunked(supabase, baseParams([unit('ABC123')]));

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/ABC123|orden de servicio/i);
  });

  it('timeout con OS reconciliada => éxito sin segundo RPC', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'upstream request timeout', code: '57014' },
    });
    maybeSingleMock.mockResolvedValue({
      data: {
        id: 'os-reconciled',
        main_serial: 'T1',
        status: 'INGRESADO',
        reception_id: '11111111-1111-1111-1111-111111111111',
        sap_transfer_id: '22222222-2222-2222-2222-222222222222',
      },
      error: null,
    });

    const result = await runClassifyEquipmentBatchChunked(supabase, baseParams([unit('T1')]));

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith('service_orders');
    expect(result.data).toHaveLength(1);
    expect(result.error).toBeUndefined();
  });

  it('timeout sin OS => un RPC y mensaje seguro (sin solapar)', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'upstream request timeout', code: '57014' },
    });

    const result = await runClassifyEquipmentBatchChunked(supabase, baseParams([unit('T1')]));

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(result.data).toBeUndefined();
    expect(result.error).toBe(CLASSIFY_TIMEOUT_SAFE_MESSAGE);
  });

  it('55P03 lock timeout => no reintenta', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'canceling statement due to lock timeout', code: '55P03' },
    });

    const result = await runClassifyEquipmentBatchChunked(supabase, baseParams([unit('T1')]));

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(fromMock).not.toHaveBeenCalled();
    expect(result.error).toMatch(/bloqueo/i);
  });

  it('correlationId estable por equipo (sin :tryN)', async () => {
    rpcMock.mockResolvedValue({
      data: {
        service_orders: [{ id: 'os-1' }],
        series_ids: ['s1'],
        units_processed: 1,
        units_skipped: 0,
      },
      error: null,
    });

    await runClassifyEquipmentBatchChunked(supabase, baseParams([unit('U1')]));

    expect(rpcMock.mock.calls[0][1].p_correlation_id).toBe('corr-batch:u1');
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
