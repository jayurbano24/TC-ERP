/**
 * @vitest-environment jsdom
 */
import { StrictMode } from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { PxSnapshotCacheEntry, PxSnapshotReason } from '@/modules/recepcion/client/pxReceptionSession.types';

const SESSION_KEY = 'tc_erp_px_incremental_reception_id';
const RECEPTION_ID = 'rec-rtl-phase4';

const mockFetchPxSnapshotForSession = vi.fn(
  async (
    receptionId: string,
    params: { reason: PxSnapshotReason; includeEquipment: boolean }
  ): Promise<PxSnapshotCacheEntry> => ({
    snapshot: {
      reception: {
        id: receptionId,
        guide_number: 'REC-RTL',
        status: 'EN_PROCESO',
        sap_document: null,
        carrier: null,
        notes: null,
        expected_units: 1,
        expected_units_sap: 1,
        received_units: 0,
        variance_units: null,
        variance_reason: null,
        version: 1,
        created_at: new Date().toISOString(),
      },
      boxes: [],
      total_captured: 0,
    },
    reason: params.reason,
    includeEquipment: params.includeEquipment,
    fetchedAt: Date.now(),
  })
);

vi.mock('@/modules/recepcion/client/pxReceptionSnapshotQuery', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/modules/recepcion/client/pxReceptionSnapshotQuery')>();
  return {
    ...actual,
    fetchPxSnapshotForSession: (
      receptionId: string,
      params: { reason: PxSnapshotReason; includeEquipment: boolean; signal?: AbortSignal }
    ) => mockFetchPxSnapshotForSession(receptionId, params),
  };
});

import {
  usePxReceptionSession,
  resetPxModuleResumeGuardForTests,
} from '@/app/(erp)/recepcion/hooks/usePxReceptionSession';
import { pxReceptionQueryKey } from '@/modules/recepcion/client/pxReceptionSnapshotQuery';

function SessionProbe({ renderTick }: { renderTick: number }) {
  const session = usePxReceptionSession();
  return (
    <span data-testid="px-session-probe">
      {session.receptionId ?? 'none'}:{renderTick}
    </span>
  );
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('PX Phase 4 — RTL critical tests', () => {
  beforeEach(() => {
    resetPxModuleResumeGuardForTests();
    mockFetchPxSnapshotForSession.mockClear();
    sessionStorage.setItem(SESSION_KEY, RECEPTION_ID);
  });

  afterEach(() => {
    sessionStorage.removeItem(SESSION_KEY);
    resetPxModuleResumeGuardForTests();
  });

  it('TEST 1 — 100 rerenders con sessionId → 1 RESUME fetch', async () => {
    const Wrapper = createWrapper();
    const { rerender } = render(<SessionProbe renderTick={0} />, { wrapper: Wrapper });

    await waitFor(() => expect(mockFetchPxSnapshotForSession).toHaveBeenCalledTimes(1));
    expect(mockFetchPxSnapshotForSession.mock.calls[0]?.[1]?.reason).toBe('RESUME');

    for (let i = 1; i < 100; i += 1) {
      rerender(<SessionProbe renderTick={i} />);
    }

    expect(mockFetchPxSnapshotForSession).toHaveBeenCalledTimes(1);
  });

  it('TEST 4 — StrictMode no duplica RESUME (guard module-level)', async () => {
    const Wrapper = createWrapper();
    render(
      <StrictMode>
        <SessionProbe renderTick={0} />
      </StrictMode>,
      { wrapper: Wrapper }
    );

    await waitFor(() => expect(mockFetchPxSnapshotForSession).toHaveBeenCalledTimes(1));
    expect(mockFetchPxSnapshotForSession.mock.calls.every((c) => c[1]?.reason === 'RESUME')).toBe(
      true
    );
  });

  it('TEST 7 — Query cache es SSOT tras resume (setQueryData)', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    render(<SessionProbe renderTick={0} />, { wrapper: Wrapper });

    await waitFor(() => {
      const entry = queryClient.getQueryData<PxSnapshotCacheEntry>(
        pxReceptionQueryKey(RECEPTION_ID)
      );
      expect(entry?.snapshot.reception.id).toBe(RECEPTION_ID);
      expect(entry?.reason).toBe('RESUME');
    });
  });
});
