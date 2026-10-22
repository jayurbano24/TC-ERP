import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
const maybeSingleMock = vi.fn();
const limitMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const orderMock = vi.fn(() => ({ limit: limitMock }));
const eqChain = {
  eq: vi.fn(function eq(this: unknown) {
    return eqChain;
  }),
  order: orderMock,
  maybeSingle: maybeSingleMock,
};
const selectMock = vi.fn(() => eqChain);
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    rpc: rpcMock,
    from: fromMock,
  }),
}));

vi.mock('@/lib/cacAgencyUtils', () => ({
  isCourierLabel: () => false,
}));

import { createOrGetSapTransfer } from './sapTransfers';

describe('createOrGetSapTransfer', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    fromMock.mockClear();
    selectMock.mockClear();
    maybeSingleMock.mockReset();
    eqChain.eq.mockClear();
    orderMock.mockClear();
    limitMock.mockClear();
  });

  it('reutiliza documento SAP existente de la misma recepción aunque la guía sea otra', async () => {
    const existing = {
      id: 'fbc6ce6f-1111-2222-3333-444444444444',
      reception_id: 'rec-1',
      reception_guide_id: 'guide-13',
      sap_document_number: '418845465/4',
      agency: 'CAC Centro',
      status: 'PENDIENTE_INGRESO_BODEGA',
    };

    rpcMock.mockResolvedValue({
      data: {
        id: 'new-duplicate-transfer',
        reception_id: 'rec-1',
        reception_guide_id: 'guide-1',
        sap_document_number: '418845465/4',
        agency: 'CAC Centro',
        status: 'PENDIENTE_INGRESO_BODEGA',
      },
      error: null,
    });
    maybeSingleMock.mockResolvedValue({ data: existing, error: null });

    const result = await createOrGetSapTransfer({
      receptionId: 'rec-1',
      receptionGuideId: 'guide-1',
      sapDocumentNumber: '418845465/4',
      agency: 'CAC Centro',
      registeredBy: 'Operador',
    });

    expect(fromMock).toHaveBeenCalledWith('sap_transfer_documents');
    expect(result.data?.id).toBe(existing.id);
    expect(result.data?.reception_guide_id).toBe('guide-13');
  });
});
