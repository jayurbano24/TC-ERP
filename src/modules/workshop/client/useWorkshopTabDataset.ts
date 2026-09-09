import { useQuery } from '@tanstack/react-query';
import type { WorkshopTabId } from '@/modules/workshop/client/workshop';
import {
  fetchWorkshopTabDatasetViaApi,
  fetchWorkshopTasksPageViaApi,
} from '@/lib/api/workshopTasks';
import { parseWorkshopSearchTokens } from '@/modules/workshop/shared/workshopSearch';

export function workshopTabDatasetQueryKey(tab: WorkshopTabId) {
  return ['workshop-tab-dataset', tab] as const;
}

export function workshopTabSearchQueryKey(tab: WorkshopTabId, search: string) {
  const { tokens } = parseWorkshopSearchTokens(search);
  return ['workshop-tab-search', tab, tokens.join('\n')] as const;
}

export function useWorkshopTabDataset(tab: WorkshopTabId, enabled: boolean) {
  return useQuery({
    queryKey: workshopTabDatasetQueryKey(tab),
    queryFn: () => fetchWorkshopTabDatasetViaApi(tab),
    enabled,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/** Búsqueda server-side por serie/OS — no depende del dataset precargado en cliente. */
export function useWorkshopTabSearch(tab: WorkshopTabId, search: string, enabled: boolean) {
  const { tokens } = parseWorkshopSearchTokens(search);
  const hasTokens = tokens.length > 0;
  return useQuery({
    queryKey: workshopTabSearchQueryKey(tab, search),
    queryFn: async () => {
      const page = await fetchWorkshopTasksPageViaApi(tab, null, search);
      return page.items;
    },
    enabled: enabled && hasTokens,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}
