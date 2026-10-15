'use client';

import { useEffect, useState } from 'react';
import { apiFetch, readApiJson } from '@/lib/http/apiFetch';

type ContextResponse = {
  cutoff: string | null;
  configured: boolean;
  canRunBackfill: boolean;
};

export type PrediagnosticoBackfillContextState = {
  cutoff: Date | null;
  canRunBackfill: boolean;
  loaded: boolean;
};

export function usePrediagnosticoBackfillContext(): PrediagnosticoBackfillContextState {
  const [state, setState] = useState<PrediagnosticoBackfillContextState>({
    cutoff: null,
    canRunBackfill: false,
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    void apiFetch('/api/v1/backoffice/prediagnostico/backfill/context', { cache: 'no-store' })
      .then((res) => readApiJson<ContextResponse>(res))
      .then((data) => {
        if (cancelled) return;
        let cutoff: Date | null = null;
        if (data.cutoff) {
          const d = new Date(data.cutoff);
          cutoff = Number.isNaN(d.getTime()) ? null : d;
        }
        setState({
          cutoff,
          canRunBackfill: Boolean(data.canRunBackfill),
          loaded: true,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ cutoff: null, canRunBackfill: false, loaded: true });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

/** @deprecated Prefer `usePrediagnosticoBackfillContext().cutoff` */
export function usePrediagnosticoBackfillCutoff(): Date | null {
  return usePrediagnosticoBackfillContext().cutoff;
}
