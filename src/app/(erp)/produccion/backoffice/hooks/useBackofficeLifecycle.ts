'use client';

import type React from 'react';
import { useEffect, useRef } from 'react';
import type { BackofficeReception, BackofficeTab } from '../types';

type InboxApi = {
  fetchPending: (opts?: { silent?: boolean }) => Promise<void>;
};

type Params = {
  activeTab: BackofficeTab;
  activeReception: BackofficeReception | null;
  inbox: InboxApi;
  loadCatalogs: () => Promise<void>;
  fetchHistory: (opts?: { silent?: boolean }) => Promise<void>;
  setSelectedAgencyId: React.Dispatch<React.SetStateAction<string>>;
  setAgencia: React.Dispatch<React.SetStateAction<string>>;
};

export function useBackofficeLifecycle({
  activeTab,
  activeReception,
  inbox,
  loadCatalogs,
  fetchHistory,
  setSelectedAgencyId,
  setAgencia,
}: Params) {
  const fetchHistoryRef = useRef(fetchHistory);
  const fetchPendingRef = useRef(inbox.fetchPending);

  fetchHistoryRef.current = fetchHistory;
  fetchPendingRef.current = inbox.fetchPending;

  useEffect(() => {
    void inbox.fetchPending();
    void loadCatalogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const refetchOnReconnect = () => {
      void fetchPendingRef.current({ silent: true });
      if (activeTab === 'history') void fetchHistoryRef.current({ silent: true });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refetchOnReconnect();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', refetchOnReconnect);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', refetchOnReconnect);
    };
  }, [activeTab]);

  useEffect(() => {
    if (activeReception) {
      setSelectedAgencyId('');
      setAgencia('');
    }
  }, [activeReception?.id, setAgencia, setSelectedAgencyId]);
}
