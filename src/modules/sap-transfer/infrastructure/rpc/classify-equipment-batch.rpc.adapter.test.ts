import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassifyEquipmentBatchRpcAdapter } from './classify-equipment-batch.rpc.adapter';

const rpcMock = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({ rpc: rpcMock }),
}));

describe('ClassifyEquipmentBatchRpcAdapter', () => {
  const adapter = new ClassifyEquipmentBatchRpcAdapter();

  beforeEach(() => {
    rpcMock.mockReset();
  });

  it('maps total failure from RPC exception to human error', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'No hay equipos para clasificar. La identidad S1-S4 no coincide.' },
    });

    const result = await adapter.classifyBatch({
      receptionId: 'rec-1',
      sapTransferId: 'sap-1',
      units: [{ main_serial: 'A1X', all_series: ['A1X'] }],
      registeredBy: 'op',
    });

    expect(result.error).toMatch(/identidad|clasificar/i);
    expect(result.data).toBeUndefined();
  });

  it('maps partial success with structured preflight codes', async () => {
    rpcMock.mockResolvedValue({
      data: {
        service_orders: [{ id: 'os-a' }],
        series_ids: ['s1'],
        units_processed: 1,
        units_skipped: 1,
        errors: [
          {
            code: 'BATCH_SERIAL_CROSS_EQUIPMENT',
            main_serial: 'B1X',
            serial: 'SHARED',
            error: 'La serie SHARED ya fue reclamada por otro equipo en este mismo lote.',
          },
        ],
      },
      error: null,
    });

    const result = await adapter.classifyBatch({
      receptionId: 'rec-1',
      sapTransferId: 'sap-1',
      units: [
        { main_serial: 'A1X', all_series: ['A1X', 'SHARED'] },
        { main_serial: 'B1X', all_series: ['B1X', 'SHARED'] },
      ],
      registeredBy: 'op',
    });

    expect(result.data).toHaveLength(1);
    expect(result.unitsProcessed).toBe(1);
    expect(result.unitsSkipped).toBe(1);
    expect(result.skippedErrors?.[0]?.code).toBe('BATCH_SERIAL_CROSS_EQUIPMENT');
    expect(result.error).toMatch(/SHARED|duplicad|lote/i);
  });

  it('surfaces PARTIAL_SERIAL_MATCH without treating as full success', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: {
        message:
          'No hay equipos para clasificar. La serie SHARED pertenece a otra identidad de equipo activa.',
      },
    });

    const result = await adapter.classifyBatch({
      receptionId: 'rec-1',
      sapTransferId: 'sap-1',
      units: [{ main_serial: 'B1X', all_series: ['B1X', 'SHARED'] }],
      registeredBy: 'op',
    });

    expect(result.error).toMatch(/identidad|SHARED|duplicad/i);
  });
});
