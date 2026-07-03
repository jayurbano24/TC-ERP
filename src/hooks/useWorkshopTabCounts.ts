'use client';

import { useQuery } from '@tanstack/react-query';
import { getWorkshopTaskCounts } from '@/modules/workshop/client/workshop';

/** Conteos de pestañas Taller vía RPC/API (cache 60s). */
export function useWorkshopTabCounts() {
  return useQuery({
    queryKey: ['workshop-tab-counts'],
    queryFn: getWorkshopTaskCounts,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
