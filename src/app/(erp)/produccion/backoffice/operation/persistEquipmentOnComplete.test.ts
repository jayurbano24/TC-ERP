import { beforeEach, describe, expect, it, vi } from 'vitest';

const { notifyError, classifyEquipmentBatch, createOrGetSapTransfer } = vi.hoisted(() => ({
  notifyError: vi.fn(),
  classifyEquipmentBatch: vi.fn(),
  createOrGetSapTransfer: vi.fn(),
}));

vi.mock('@/components/ui/messaging/messageStore', () => ({
  notify: { error: notifyError, warning: vi.fn(), success: vi.fn() },
}));

vi.mock('@/modules/sap-transfer/client/sapTransferData', () => ({
  createOrGetSapTransfer,
  classifyEquipmentBatch,
}));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    auth: { getUser: async () => ({ data: { user: { email: 'test@tc.local' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { id: 'guide-id' } }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/modules/recepcion/client/receptions', () => ({
  createServiceOrders: vi.fn(),
}));

import { persistEquipmentOnComplete } from './persistEquipmentOnComplete';

describe('persistEquipmentOnComplete notifications', () => {
  beforeEach(() => {
    notifyError.mockReset();
    classifyEquipmentBatch.mockReset();
    createOrGetSapTransfer.mockResolvedValue({ data: { id: 'sap-id' }, error: null });
  });

  it('no muestra toast en error de classify (lo resume completeCurrentGuides)', async () => {
    classifyEquipmentBatch.mockResolvedValue({
      data: undefined,
      error: 'El servidor tardó demasiado en guardar los equipos.',
    });

    await persistEquipmentOnComplete({
      activeReceptionId: '11111111-1111-1111-1111-111111111111',
      scannedGuides: ['418845465-7'],
      guideItems: [
        {
          id: 1,
          tipo: 'Equipo',
          cantidad: 1,
          scannedCount: 1,
          seriesPerUnit: 1,
          modelo: '25f8c1e6-0433-4aed-958e-444b836ac431',
          marca: '99da0a2f-b41c-4502-9137-de8a6ad89fa5',
          sapGroupId: 'g1',
          series: [['ZTEATV45500264360']],
        },
      ],
      sapGroups: [{ id: 'g1', sapDocument: '418845465/10' }],
      sapTransferNumber: '418845465/10',
      agencyLabel: 'Agencia',
      currentUserFullName: 'Operador',
    });

    expect(notifyError).not.toHaveBeenCalled();
  });
});
