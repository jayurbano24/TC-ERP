'use client';

import type React from 'react';
import { useCallback, useRef, useState } from 'react';
import { getReceptions } from '@/lib/database/receptions';
import { receptionHasTcOs } from '../historyTrayUtils';
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
      const pending = data.filter((r) => {
        const source = (r as BackofficeReception & { source?: string }).source;
        return (
          (source !== 'px' || r.status === 'PENDIENTE_BACKOFFICE') &&
          r.status !== 'RECIBIDO_BACKOFFICE' &&
          r.status !== 'PROCESADO' &&
          r.status !== 'CLASIFICADA' &&
          r.status !== 'DEVUELTO_A_AGENCIA' &&
          r.status !== 'FINALIZADO' &&
          r.status !== 'ELIMINADO' &&
          r.status !== 'ELIMINADO POR BODEGA'
        );
      });
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
        alert(
          'Esta gu\u00eda tiene un ingreso anterior incompleto (trazabilidad en notas pero sin OS TC-XXX).\n' +
            'Complete el flujo de nuevo y confirme el mensaje "\u2705 X equipo(s) registrado(s)" al finalizar.'
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
