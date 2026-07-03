'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchWorkshopQueuePage,
  type WorkshopQueueItem,
} from '@/lib/api/workshopQueue';

export function useWorkshopQueue(tab: string = 'diagnostico') {
  const [items, setItems] = useState<WorkshopQueueItem[]>([]);
  const [totalOs, setTotalOs] = useState<number | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (nextCursor?: string | null, append = false) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchWorkshopQueuePage(tab, nextCursor);
        setTotalOs(data.totalOs);
        setCursor(data.nextCursor);
        setItems((prev) => (append ? [...prev, ...data.items] : data.items));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar cola');
      } finally {
        setLoading(false);
      }
    },
    [tab]
  );

  useEffect(() => {
    void fetchPage(null, false);
  }, [fetchPage]);

  return {
    items,
    totalOs,
    loading,
    error,
    hasMore: Boolean(cursor),
    loadMore: () => cursor && fetchPage(cursor, true),
    refresh: () => fetchPage(null, false),
  };
}
