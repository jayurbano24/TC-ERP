'use client';

import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getReceptions } from '@/lib/database/receptions';
import { notify } from '@/components/ui/messaging/messageStore';
import { receptionHasTcOs } from '../historyTrayUtils';
import { shouldShowInCacInbox } from '../cacInboxFilter';
import type { BackofficeReception, ReceptionStep } from '../types';

const INBOX_QUERY_KEY = ['backoffice-inbox'] as const;

type InboxDeps = {
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveReception: React.Dispatch<React.SetStateAction<BackofficeReception | null>>;
  setProcessedGuides: React.Dispatch<React.SetStateAction<string[]>>;
  setReceptionStep: React.Dispatch<React.SetStateAction<ReceptionStep>>;
};

/**
 * C6: bandeja de entrada del backoffice servida por React Query.
 *
 * El fetch (getReceptions) vive ahora en la caché de TanStack Query. Para no
 * alterar el comportamiento existente, la carga sigue siendo explícita vía
 * `fetchPending` (lo dispara el lifecycle en mount y en visibility/online/tab),
 * conservando el toggle del `loading` global y la opción `silent`.
 *
 * `setAllReceptions` mantiene su firma previa (value | updater) pero ahora
 * escribe en la caché con `setQueryData`, de modo que los updates optimistas de
 * los consumidores (p. ej. SubBodegaTab) siguen funcionando sin cambios.
 */
export function useBackofficeInbox(deps: InboxDeps) {
  const queryClient = useQueryClient();
  const [inboxLoadError, setInboxLoadError] = useState<string | null>(null);

  const { data, refetch } = useQuery({
    queryKey: INBOX_QUERY_KEY,
    queryFn: async () => (await getReceptions()) as BackofficeReception[],
    enabled: false,
  });

  const allReceptions = useMemo(() => data ?? [], [data]);
  const pendingReceptions = useMemo(
    () => allReceptions.filter((r) => shouldShowInCacInbox(r)),
    [allReceptions]
  );

  const setAllReceptions = useCallback(
    (updater: React.SetStateAction<BackofficeReception[]>) => {
      queryClient.setQueryData<BackofficeReception[]>(INBOX_QUERY_KEY, (prev) => {
        const base = prev ?? [];
        return typeof updater === 'function'
          ? (updater as (p: BackofficeReception[]) => BackofficeReception[])(base)
          : updater;
      });
    },
    [queryClient]
  );

  const fetchPending = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) deps.setLoading(true);
      setInboxLoadError(null);
      try {
        const result = await refetch();
        if (result.error) {
          const message =
            result.error instanceof Error
              ? result.error.message
              : 'No se pudo cargar la bandeja de entrada.';
          console.error('Error fetching receptions:', result.error);
          setInboxLoadError(message);
        }
      } finally {
        if (!opts?.silent) deps.setLoading(false);
      }
    },
    [refetch, deps]
  );

  const startProcessingReception = useCallback(
    (rec: BackofficeReception) => {
      const notes = rec.notes || '';
      const hadFailedClassif =
        !receptionHasTcOs(rec) &&
        (/clasificaci\u00f3n/i.test(notes) ||
          /--- DETALLES BACKOFFICE ---/i.test(notes) ||
          /Backoffice_Agency:/i.test(notes));
      if (hadFailedClassif) {
        notify.warning(
          'Complete el flujo de nuevo y confirme el mensaje "X equipo(s) registrado(s)" al finalizar.',
          {
            title: 'Ingreso anterior incompleto',
            duration: 8000,
          }
        );
      }
      deps.setActiveReception(rec);
      deps.setProcessedGuides(rec.processed_guides || []);
      deps.setReceptionStep('classification');
    },
    [deps]
  );

  return {
    allReceptions,
    setAllReceptions,
    pendingReceptions,
    inboxLoadError,
    setInboxLoadError,
    fetchPending,
    startProcessingReception,
  };
}
