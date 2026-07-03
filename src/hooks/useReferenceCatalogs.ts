'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchReferenceCatalogsViaApi } from '@/lib/api/referenceCatalogs';
import {
  resolveBrandName,
  resolveModelName,
  resolveTechName,
  resolveTechNameForModel,
  type CatalogLookups,
} from '@/shared/catalogs/catalogLookups';

const EMPTY_LOOKUPS: CatalogLookups = {
  technologies: [],
  brands: [],
  models: [],
  techNameById: new Map(),
  brandNameById: new Map(),
  modelNameById: new Map(),
  techIdByModelId: new Map(),
};

export const REFERENCE_CATALOGS_QUERY_KEY = ['reference-catalogs', 'v1'] as const;

/**
 * Catálogos tech/marca/modelo vía GET /api/v1/catalogs/reference (30 min cache).
 */
export function useReferenceCatalogs() {
  const query = useQuery({
    queryKey: [...REFERENCE_CATALOGS_QUERY_KEY],
    queryFn: fetchReferenceCatalogsViaApi,
    staleTime: 30 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const lookups = query.data ?? EMPTY_LOOKUPS;

  const helpers = useMemo(
    () => ({
      techName: (id?: string | null, fallback?: string) => resolveTechName(lookups, id, fallback),
      brandName: (id?: string | null, fallback?: string) => resolveBrandName(lookups, id, fallback),
      modelName: (id?: string | null, fallback?: string) => resolveModelName(lookups, id, fallback),
      techNameForModel: (modelId?: string | null, fallback?: string) =>
        resolveTechNameForModel(lookups, modelId, fallback),
    }),
    [lookups]
  );

  return {
    ...lookups,
    ...helpers,
    isLoading: query.isLoading,
    isReady: !query.isLoading && !query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
