import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterIndividualReturnHandler } from './register-individual-return.handler';
import { RegisterIndividualReturnCommand } from './register-individual-return.command';
import type { ISapTransferReturnPort } from '../../domain/ports/sap-transfer-return.port';

const mockFrom = vi.fn();
const mockSupabase = { from: mockFrom };

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => mockSupabase,
}));

vi.mock('@/lib/database/audit', () => ({
  logAdvancedAudit: vi.fn().mockResolvedValue(undefined),
}));

function chain(resolved: { data?: unknown; error?: unknown; count?: number }) {
  const builder: Record<string, unknown> = {};
  const terminal = vi.fn().mockResolvedValue(resolved);
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.maybeSingle = terminal;
  builder.single = terminal;
  builder.update = vi.fn().mockReturnValue(builder);
  return builder;
}

describe('RegisterIndividualReturnHandler (CHG-007)', () => {
  const sapPort: ISapTransferReturnPort = {
    countActiveUnits: vi.fn(),
    getDocument: vi.fn(),
    executeBlockReturn: vi.fn(),
  };
  const handler = new RegisterIndividualReturnHandler(sapPort);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('actualiza service_orders a DEVUELTO en devolución individual', async () => {
    const seriesChain = chain({
      data: {
        id: 'series-1',
        serial_number: 'SN-100',
        current_status: 'RECEPCIONADO_BODEGA_GENERAL',
        current_reception_id: null,
        service_order_id: 'os-99',
        sap_transfer_id: null,
      },
    });
    const seriesUpdateChain = chain({ error: null });
    const osUpdateChain = chain({ error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'series') {
        if (mockFrom.mock.calls.filter((c) => c[0] === 'series').length === 1) {
          return seriesChain;
        }
        return seriesUpdateChain;
      }
      if (table === 'service_orders') return osUpdateChain;
      return chain({});
    });

    const result = await handler.execute(
      new RegisterIndividualReturnCommand({
        sn: 'SN-100',
        motivo: 'Cliente canceló',
        guiaSalida: 'G-1',
      })
    );

    expect(result).toEqual({ success: true });
    expect(osUpdateChain.update).toHaveBeenCalledWith({ status: 'DEVUELTO' });
    expect(osUpdateChain.eq).toHaveBeenCalledWith('id', 'os-99');
  });
});
