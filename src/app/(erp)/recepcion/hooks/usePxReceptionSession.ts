'use client';

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  fetchPxSnapshotForSession,
  pxReceptionQueryKey,
} from '@/modules/recepcion/client/pxReceptionSnapshotQuery';
import { ingestPxSnapshotToCache } from '@/modules/recepcion/client/pxMutationCache';
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

/** Idempotencia module-level — sobrevive StrictMode remounts. */
const moduleResumeAttemptedFor = new Set<string>();

/**
 * Application controller — owner de sesión PX y comandos snapshot explícitos.
 *
 * Reglas:
 * - RENDER ≠ COMMAND
 * - STATE CHANGE ≠ AUTOMATIC SERVER FETCH
 * - TanStack Query cache = SSOT de server snapshot (via onSnapshotApplied)
 */
export function usePxReceptionSession() {
  const queryClient = useQueryClient();
  const storeRef = useRef<PxReceptionSessionStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = createPxReceptionSessionStore({
      softRefreshIdleMs: SOFT_REFRESH_IDLE_MS,
      fetchSnapshot: fetchPxSnapshotForSession,
      onSnapshotApplied: (receptionId, entry) => {
        ingestPxSnapshotToCache(
          queryClient,
          receptionId,
          entry.snapshot,
          entry.reason,
          entry.includeEquipment
        );
      },
    });
  }

  const store = storeRef.current;

  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);

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
      const receptionId = snapshot.reception.id;
      if (receptionId) {
        ingestPxSnapshotToCache(queryClient, receptionId, snapshot, reason, includeEquipment);
      }
    },
    [queryClient, store]
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

  useEffect(() => {
    const sessionId = getIncrementalReceptionIdFromSession();
    if (!sessionId || moduleResumeAttemptedFor.has(sessionId)) return;
    moduleResumeAttemptedFor.add(sessionId);
    void resume(sessionId);
  }, [resume]);

  useEffect(() => () => store.dispose(), [store]);

  return {
    receptionId: state.receptionId,
    snapshotEntry: state.snapshotEntry,
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

/** Solo tests — reset idempotencia module-level. */
export function resetPxModuleResumeGuardForTests(): void {
  moduleResumeAttemptedFor.clear();
}
