import {
  buildSnapshotDedupeKey,
  shouldApplySnapshotEntry,
} from './pxReceptionSnapshotQuery';
import type {
  PxReceptionSessionState,
  PxSnapshotCacheEntry,
  PxSnapshotFetchParams,
  PxSnapshotReason,
} from './pxReceptionSession.types';

export type PxSnapshotFetcher = (
  receptionId: string,
  params: PxSnapshotFetchParams
) => Promise<PxSnapshotCacheEntry>;

export type PxReceptionSessionStoreOptions = {
  fetchSnapshot: PxSnapshotFetcher;
  softRefreshIdleMs: number;
};

export type PxReceptionSessionCommands = {
  resume: (receptionId: string, isResumable: (status: string | null | undefined) => boolean) => Promise<boolean>;
  start: (receptionId: string) => Promise<void>;
  reconcile: (reason: PxSnapshotReason, includeEquipment?: boolean) => Promise<void>;
  refresh: (reason?: PxSnapshotReason) => Promise<void>;
  ingestSnapshot: (
    snapshot: PxSnapshotCacheEntry['snapshot'],
    reason: PxSnapshotReason,
    includeEquipment: boolean
  ) => void;
  scheduleSoftReconciliation: () => void;
  clearSession: () => void;
  switchReception: (receptionId: string, isResumable: (status: string | null | undefined) => boolean) => Promise<boolean>;
  dispose: () => void;
};

export type PxReceptionSessionStore = PxReceptionSessionCommands & {
  subscribe: (listener: () => void) => () => void;
  getState: () => PxReceptionSessionState;
};

export function createPxReceptionSessionStore(
  options: PxReceptionSessionStoreOptions
): PxReceptionSessionStore {
  let state: PxReceptionSessionState = {
    receptionId: null,
    snapshotEntry: null,
    isLoadingResume: false,
    appliedVersion: 0,
  };

  const listeners = new Set<() => void>();
  const resumeHydratedIds = new Set<string>();
  const inFlight = new Map<string, Promise<PxSnapshotCacheEntry>>();
  const abortByKey = new Map<string, AbortController>();
  let softRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  let generation = 0;

  const notify = () => {
    listeners.forEach((listener) => listener());
  };

  const patchState = (partial: Partial<PxReceptionSessionState>) => {
    state = { ...state, ...partial };
    notify();
  };

  const applyEntry = (entry: PxSnapshotCacheEntry): boolean => {
    if (!shouldApplySnapshotEntry(entry, state.appliedVersion)) return false;
    const version = entry.snapshot.reception.version ?? 1;
    state.appliedVersion = version;
    state.snapshotEntry = entry;
    notify();
    return true;
  };

  const cancelInFlightForReception = (receptionId: string) => {
    for (const [key, controller] of abortByKey.entries()) {
      if (key.startsWith(`${receptionId}:`)) {
        controller.abort();
        abortByKey.delete(key);
        inFlight.delete(key);
      }
    }
  };

  const fetchSnapshotCommand = async (
    receptionId: string,
    reason: PxSnapshotReason,
    includeEquipment?: boolean,
    activeGeneration = generation
  ): Promise<PxSnapshotCacheEntry> => {
    const resolvedInclude = includeEquipment ?? reason === 'RESUME';
    const dedupeKey = buildSnapshotDedupeKey(receptionId, reason, resolvedInclude);

    const existing = inFlight.get(dedupeKey);
    if (existing) return existing;

    const controller = new AbortController();
    abortByKey.set(dedupeKey, controller);

    const promise = options
      .fetchSnapshot(receptionId, {
        reason,
        includeEquipment: resolvedInclude,
        signal: controller.signal,
      })
      .then((entry) => {
        if (activeGeneration !== generation) return entry;
        applyEntry(entry);
        return entry;
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }
        throw error;
      })
      .finally(() => {
        inFlight.delete(dedupeKey);
        abortByKey.delete(dedupeKey);
      });

    inFlight.set(dedupeKey, promise);
    return promise;
  };

  const clearSoftRefreshTimer = () => {
    if (softRefreshTimer !== null) {
      clearTimeout(softRefreshTimer);
      softRefreshTimer = null;
    }
  };

  const commands: PxReceptionSessionCommands = {
    async resume(receptionId, isResumable) {
      if (
        resumeHydratedIds.has(receptionId) &&
        state.receptionId === receptionId &&
        state.snapshotEntry
      ) {
        return true;
      }

      patchState({ isLoadingResume: true });
      try {
        const entry = await fetchSnapshotCommand(receptionId, 'RESUME', true);
        if (!isResumable(entry.snapshot.reception.status)) {
          resumeHydratedIds.delete(receptionId);
          return false;
        }
        resumeHydratedIds.add(receptionId);
        patchState({ receptionId });
        return true;
      } finally {
        patchState({ isLoadingResume: false });
      }
    },

    async start(receptionId) {
      generation += 1;
      clearSoftRefreshTimer();
      if (state.receptionId && state.receptionId !== receptionId) {
        cancelInFlightForReception(state.receptionId);
        resumeHydratedIds.delete(state.receptionId);
      }
      patchState({
        receptionId,
        snapshotEntry: null,
        appliedVersion: 0,
      });
      resumeHydratedIds.add(receptionId);
      await fetchSnapshotCommand(receptionId, 'START', false, generation);
    },

    async reconcile(reason, includeEquipment = false) {
      if (!state.receptionId) return;
      await fetchSnapshotCommand(state.receptionId, reason, includeEquipment, generation);
    },

    async refresh(reason = 'EXPLICIT_REFRESH') {
      if (!state.receptionId) return;
      await fetchSnapshotCommand(state.receptionId, reason, false, generation);
    },

    ingestSnapshot(snapshot, reason, includeEquipment) {
      applyEntry({
        snapshot,
        reason,
        includeEquipment,
        fetchedAt: Date.now(),
      });
    },

    scheduleSoftReconciliation() {
      if (!state.receptionId) return;
      clearSoftRefreshTimer();
      const receptionId = state.receptionId;
      const activeGeneration = generation;
      softRefreshTimer = setTimeout(() => {
        softRefreshTimer = null;
        if (state.receptionId !== receptionId || activeGeneration !== generation) return;
        void fetchSnapshotCommand(receptionId, 'SOFT_REFRESH', false, activeGeneration);
      }, options.softRefreshIdleMs);
    },

    clearSession() {
      generation += 1;
      clearSoftRefreshTimer();
      if (state.receptionId) {
        cancelInFlightForReception(state.receptionId);
        resumeHydratedIds.delete(state.receptionId);
      }
      resumeHydratedIds.clear();
      inFlight.clear();
      state = {
        receptionId: null,
        snapshotEntry: null,
        isLoadingResume: false,
        appliedVersion: 0,
      };
      notify();
    },

    async switchReception(receptionId, isResumable) {
      if (state.receptionId === receptionId && state.snapshotEntry) return true;
      generation += 1;
      clearSoftRefreshTimer();
      if (state.receptionId) {
        cancelInFlightForReception(state.receptionId);
      }
      patchState({
        receptionId,
        snapshotEntry: null,
        appliedVersion: 0,
      });
      return commands.resume(receptionId, isResumable);
    },

    dispose() {
      generation += 1;
      clearSoftRefreshTimer();
      for (const controller of abortByKey.values()) controller.abort();
      abortByKey.clear();
      inFlight.clear();
      listeners.clear();
    },
  };

  return {
    ...commands,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState() {
      return state;
    },
  };
}
