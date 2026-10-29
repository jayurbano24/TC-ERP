import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const transferViaApi = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ success: true, transferred: 1, results: [] }),
);
const rpcMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/warehouseTransfer', () => ({
  transferBoxesToWorkshopViaApi: transferViaApi,
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    rpc: rpcMock,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: '00000000-0000-4000-8000-000000000099',
              full_name: 'Op Test',
            },
          }),
        }),
      }),
    }),
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: '00000000-0000-4000-8000-000000000099',
            email: 'op@test.local',
            user_metadata: {},
          },
        },
      }),
    },
  }),
}));

describe('transferBoxesToArea → taller (Phase 0 API-only)', () => {
  afterEach(() => {
    transferViaApi.mockClear();
    rpcMock.mockClear();
  });

  it('Diagnóstico usa API y no invoca warehouse_dispersion_tx en el browser', async () => {
    const { transferBoxesToArea } = await import('@/lib/database/warehouse');
    const boxId = '33333333-3333-4333-8333-333333333333';
    const result = await transferBoxesToArea([boxId], 'Diagnóstico');

    expect(result).toMatchObject({ success: true });
    expect(transferViaApi).toHaveBeenCalledWith([boxId]);
    expect(rpcMock).not.toHaveBeenCalledWith(
      'warehouse_dispersion_tx',
      expect.anything(),
    );
  });

  it('el fuente de transferBoxesToArea no contiene fallback RPC de dispersión', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/database/warehouse.ts'),
      'utf8',
    );
    const fnStart = source.indexOf('export async function transferBoxesToArea');
    const fnEnd = source.indexOf('function chunkBoxIds', fnStart);
    const body = source.slice(fnStart, fnEnd);
    expect(body).toContain('transferBoxesToWorkshopViaApi');
    expect(body).not.toContain("'warehouse_dispersion_tx'");
    expect(body).not.toContain('"warehouse_dispersion_tx"');
  });
});
