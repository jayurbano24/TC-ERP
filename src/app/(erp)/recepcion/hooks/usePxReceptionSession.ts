'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchPxSnapshotForSession,
  pxReceptionQueryKey,
} from '@/modules/recepcion/client/pxReceptionSnapshotQuery';
import {
  createPxReceptionSessionStore,
  type PxReceptionSessionStore,
} from '@/modules/recepcion/client/pxReceptionSessionStore';
import type { PxSnapshotReason } from '@/modules/recepcion/client/pxReceptionSession.types';
import {
  getIncrementalReceptionIdFromSession,
  isPxReceptionResumable,
  setIncrementalReceptionIdInSession,
} from '../services/pxIncrementalApi';

const SOFT_REFRESH_IDLE_MS = 45_000;

function syncSnapshotToQueryCache(
  queryClient: ReturnType<typeof useQueryClient>,
  receptionId: string,
  entry: ReturnType<PxReceptionSessionStore['getState']>['snapshotEntry']
) {
  if (!entry) {
    queryClient.removeQueries({ queryKey: pxReceptionQueryKey(receptionId) });
    return;
  }
  queryClient.setQueryData(pxReceptionQueryKey(receptionId), entry);
}

/**
 * Application controller — único owner de sesión PX y sincronización snapshot.
 *
 * Reglas:
 * - RENDER ≠ COMMAND
 * - STATE CHANGE ≠ AUTOMATIC SERVER FETCH
 * - Todo GET snapshot lleva reason explícito (ver pxReceptionSession.types)
 */
export function usePxReceptionSession() {
  const queryClient = useQueryClient();
  const storeRef = useRef<PxReceptionSessionStore | null>(null);
  const mountResumeDoneRef = useRef(false);

  if (!storeRef.current) {
    storeRef.current = createPxReceptionSessionStore({
      softRefreshIdleMs: SOFT_REFRESH_IDLE_MS,
      fetchSnapshot: fetchPxSnapshotForSession,
    });
  }

  const store = storeRef.current;

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

  useEffect(() => {
    if (state.snapshotEntry && state.receptionId) {
      syncSnapshotToQueryCache(queryClient, state.receptionId, state.snapshotEntry);
    }
  }, [queryClient, state.receptionId, state.snapshotEntry]);

  const resume = useCallback(
    async (receptionId?: string) => {
      const targetId = receptionId ?? getIncrementalReceptionIdFromSession();
      if (!targetId) return false;

      const ok = await store.resume(targetId, isPxReceptionResumable);
      if (!ok) {
        setIncrementalReceptionIdInSession(null);
        return false;
      }
      setIncrementalReceptionIdInSession(targetId);
      return true;
    },
    [store]
  );

  const start = useCallback(
    async (receptionId: string) => {
      setIncrementalReceptionIdInSession(receptionId);
      await store.start(receptionId);
    },
    [store]
  );

  const reconcile = useCallback(
    async (reason: PxSnapshotReason, includeEquipment = false) => {
      await store.reconcile(reason, includeEquipment);
    },
    [store]
  );

  const refresh = useCallback(
    async (reason: PxSnapshotReason = 'EXPLICIT_REFRESH') => {
      await store.refresh(reason);
    },
    [store]
  );

  const ingestSnapshot = useCallback(
    (
      snapshot: NonNullable<typeof state.snapshotEntry>['snapshot'],
      reason: PxSnapshotReason,
      includeEquipment: boolean
    ) => {
      store.ingestSnapshot(snapshot, reason, includeEquipment);
    },
    [store]
  );

  const scheduleSoftReconciliation = useCallback(() => {
    store.scheduleSoftReconciliation();
  }, [store]);

  const clearSession = useCallback(() => {
    const id = store.getState().receptionId;
    store.clearSession();
    if (id) queryClient.removeQueries({ queryKey: pxReceptionQueryKey(id) });
    setIncrementalReceptionIdInSession(null);
  }, [queryClient, store]);

  const switchReception = useCallback(
    async (receptionId: string) => {
      setIncrementalReceptionIdInSession(receptionId);
      const ok = await store.switchReception(receptionId, isPxReceptionResumable);
      if (!ok) setIncrementalReceptionIdInSession(null);
      return ok;
    },
    [store]
  );

  const resumeCommandRef = useRef(resume);
  resumeCommandRef.current = resume;

  useEffect(() => {
    if (mountResumeDoneRef.current) return;
    const sessionId = getIncrementalReceptionIdFromSession();
    if (!sessionId) return;
    mountResumeDoneRef.current = true;
    void resumeCommandRef.current(sessionId);
  }, []);

  useEffect(() => () => store.dispose(), [store]);

  return {
    receptionId: state.receptionId,
    snapshot: state.snapshotEntry?.snapshot ?? null,
    snapshotEntry: state.snapshotEntry,
    receptionVersion: state.snapshotEntry?.snapshot.reception.version ?? 1,
    isLoadingResume: state.isLoadingResume,
    resume,
    start,
    reconcile,
    refresh,
    ingestSnapshot,
    scheduleSoftReconciliation,
    clearSession,
    switchReception,
  };
}

export type PxReceptionSession = ReturnType<typeof usePxReceptionSession>;
