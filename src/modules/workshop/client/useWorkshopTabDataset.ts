import { useQuery } from '@tanstack/react-query';
import type { WorkshopTabId } from '@/modules/workshop/client/workshop';
import { fetchWorkshopTabDatasetViaApi } from '@/lib/api/workshopTasks';

export function workshopTabDatasetQueryKey(tab: WorkshopTabId) {
  return ['workshop-tab-dataset', tab] as const;
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
