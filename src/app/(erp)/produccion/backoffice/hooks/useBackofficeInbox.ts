'use client';

import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import { getReceptions } from '@/lib/database/receptions';
import { notify } from '@/components/ui/messaging/messageStore';
import { receptionHasTcOs } from '../historyTrayUtils';
import { shouldShowInCacInbox } from '../cacInboxFilter';
import type { BackofficeReception, ReceptionStep } from '../types';

type InboxDeps = {
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveReception: React.Dispatch<React.SetStateAction<BackofficeReception | null>>;
  setProcessedGuides: React.Dispatch<React.SetStateAction<string[]>>;
  setReceptionStep: React.Dispatch<React.SetStateAction<ReceptionStep>>;
};

export function useBackofficeInbox(deps: InboxDeps) {
  const pendingFetchIdRef = useRef(0);
  const [allReceptions, setAllReceptions] = useState<BackofficeReception[]>([]);
  const [pendingReceptions, setPendingReceptions] = useState<BackofficeReception[]>([]);
  const [inboxLoadError, setInboxLoadError] = useState<string | null>(null);

  const fetchPending = useCallback(async (opts?: { silent?: boolean }) => {
    const fetchId = ++pendingFetchIdRef.current;
    if (!opts?.silent) deps.setLoading(true);
    setInboxLoadError(null);
    try {
      const data = (await getReceptions()) as BackofficeReception[];
      if (fetchId !== pendingFetchIdRef.current) return;
      setAllReceptions(data);
      const pending = data.filter((r) => shouldShowInCacInbox(r));
      setPendingReceptions(pending);
    } catch (error: unknown) {
      if (fetchId !== pendingFetchIdRef.current) return;
      const message = error instanceof Error ? error.message : 'No se pudo cargar la bandeja de entrada.';
      console.error('Error fetching receptions:', error);
      setInboxLoadError(message);
    } finally {
      if (fetchId === pendingFetchIdRef.current) deps.setLoading(false);
    }
  }, [deps]);

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
