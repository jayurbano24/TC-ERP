import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClassifyEquipmentBatchRpcAdapter } from './classify-equipment-batch.rpc.adapter';

const apiFetchMock = vi.fn();

vi.mock('@/lib/http/apiFetch', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
  readApiJson: async (res: Response) => res.json(),
}));

describe('ClassifyEquipmentBatchRpcAdapter', () => {
  const adapter = new ClassifyEquipmentBatchRpcAdapter();

  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('delega classify a la API backoffice', async () => {
    apiFetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 'os-a' }],
          unitsProcessed: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await adapter.classifyBatch({
      receptionId: 'rec-1',
      sapTransferId: 'sap-1',
      units: [{ main_serial: 'A1X', all_series: ['A1X'], model_id: 'm', brand_id: 'b' }],
      registeredBy: 'op',
    });

    expect(apiFetchMock).toHaveBeenCalledWith(
      '/api/v1/backoffice/classify-equipment-batch',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.data).toHaveLength(1);
  });

  it('humaniza error de red/API', async () => {
    apiFetchMock.mockRejectedValue(new Error('upstream request timeout'));

    const result = await adapter.classifyBatch({
      receptionId: 'rec-1',
      sapTransferId: 'sap-1',
      units: [{ main_serial: 'A1X', all_series: ['A1X'], model_id: 'm', brand_id: 'b' }],
      registeredBy: 'op',
    });

    expect(result.error).toMatch(/tardó demasiado|timeout/i);
  });
});
