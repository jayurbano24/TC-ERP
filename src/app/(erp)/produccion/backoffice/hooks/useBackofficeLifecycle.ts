'use client';

import type React from 'react';
import { useEffect } from 'react';
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
  useEffect(() => {
    void inbox.fetchPending();
    void loadCatalogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const refetchOnReconnect = () => {
      void inbox.fetchPending({ silent: true });
      if (activeTab === 'history') void fetchHistory({ silent: true });
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
  }, [activeTab, fetchHistory, inbox]);

  useEffect(() => {
    if (activeReception) {
      setSelectedAgencyId('');
      setAgencia('');
    }
  }, [activeReception?.id, setAgencia, setSelectedAgencyId]);

  useEffect(() => {
    if (activeTab === 'history') {
      void inbox.fetchPending();
      void fetchHistory();
    }
  }, [activeTab, fetchHistory, inbox]);
}
