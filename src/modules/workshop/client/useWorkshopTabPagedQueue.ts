'use client';

import { useEffect, useRef } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { WorkshopTabId } from '@/modules/workshop/client/workshop';
import { fetchWorkshopTasksPageViaApi } from '@/lib/api/workshopTasks';
import { WORKSHOP_QUEUE_PAGE_SIZE } from '@/modules/workshop/shared/workshopQueueTablePolicy';

export function workshopTabPagedQueryKey(tab: WorkshopTabId, page: number) {
  return ['workshop-tab-paged', tab, page] as const;
}

/**
 * Paginación server-side por cursor (SCRAPS y colas grandes).
 * Cachea cursores por hoja para navegar sin recargar todo el dataset.
 */
export function useWorkshopTabPagedQueue(
  tab: WorkshopTabId,
  page: number,
  enabled: boolean,
) {
  const cursorAfterPageRef = useRef<Map<number, string | null>>(new Map([[1, null]]));

  useEffect(() => {
    cursorAfterPageRef.current = new Map([[1, null]]);
  }, [tab]);

  return useQuery({
    queryKey: workshopTabPagedQueryKey(tab, page),
    queryFn: async () => {
      let cursor: string | null = null;

      for (let p = 1; p < page; p++) {
        const cachedNext = cursorAfterPageRef.current.get(p + 1);
        if (cachedNext !== undefined) {
          cursor = cachedNext;
          if (cursor == null) break;
          continue;
        }

        const step = await fetchWorkshopTasksPageViaApi(
          tab,
          cursor,
          undefined,
          WORKSHOP_QUEUE_PAGE_SIZE,
        );
        cursorAfterPageRef.current.set(p + 1, step.nextCursor);
        cursor = step.nextCursor;
        if (!cursor) break;
      }

      const result = await fetchWorkshopTasksPageViaApi(
        tab,
        cursor,
        undefined,
        WORKSHOP_QUEUE_PAGE_SIZE,
      );
      cursorAfterPageRef.current.set(page + 1, result.nextCursor);
      return result;
    },
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
