import { afterEach, describe, expect, it, vi } from 'vitest';
import { transferBoxesToWorkshopViaApi } from '@/lib/api/warehouseTransfer';
import { isWarehouseTransferApiEnabled } from '@/shared/feature-flags/clientFlags';

describe('warehouse transfer API contract (Phase 0)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('isWarehouseTransferApiEnabled siempre true (API obligatoria)', () => {
    expect(isWarehouseTransferApiEnabled()).toBe(true);
  });

  it('POST /api/v1/warehouse/transfer-to-workshop con boxIds + targetModule taller', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, transferred: 2, total: 2, results: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const boxIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    ];
    const result = await transferBoxesToWorkshopViaApi(boxIds);

    expect(result.success).toBe(true);
    expect(result.transferred).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/v1/warehouse/transfer-to-workshop');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(String(init.body))).toEqual({
      boxIds,
      targetModule: 'taller',
    });
  });

  it('propaga error de caja cuando HTTP no es ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({
          error: 'ALL_FAILED',
          results: [{ boxId: 'b1', ok: false, error: 'EMPTY_BOX' }],
        }),
      }),
    );

    const result = await transferBoxesToWorkshopViaApi(['11111111-1111-4111-8111-111111111111']);
    expect(result.success).toBe(false);
    expect(result.error).toBe('EMPTY_BOX');
  });
});
