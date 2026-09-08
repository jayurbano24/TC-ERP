'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { pxReceptionQueryKey } from '@/modules/recepcion/client/pxReceptionSnapshotQuery';
import type { PxSnapshotCacheEntry } from '@/modules/recepcion/client/pxReceptionSession.types';

/**
 * Server state SSOT — lectura del snapshot desde TanStack Query cache.
 * Fetch solo vía comandos explícitos de sesión (fetchQuery / setQueryData).
 */
export function usePxReceptionSnapshotQuery(receptionId: string | null) {
  const queryClient = useQueryClient();

  return useQuery<PxSnapshotCacheEntry | null>({
    queryKey: receptionId ? pxReceptionQueryKey(receptionId) : ['px-reception', '__none__'],
    queryFn: () => {
      if (!receptionId) return null;
      return queryClient.getQueryData<PxSnapshotCacheEntry>(pxReceptionQueryKey(receptionId)) ?? null;
    },
    enabled: Boolean(receptionId),
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    structuralSharing: true,
  });
}
