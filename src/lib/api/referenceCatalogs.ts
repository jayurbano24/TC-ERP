import {
  buildCatalogLookups,
  type CatalogLookups,
} from '@/shared/catalogs/catalogLookups';
import type { ReferenceCatalogsPayload } from '@/shared/infrastructure/catalogs/fetchReferenceCatalogs';

export async function fetchReferenceCatalogsViaApi(): Promise<CatalogLookups> {
  const res = await fetch('/api/v1/catalogs/reference', { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  const payload = data as ReferenceCatalogsPayload;
  return buildCatalogLookups(payload.technologies, payload.brands, payload.models);
}

export type WorkshopOperationCatalogDiagnostic = {
  id: string;
  nombre: string;
  reparacionesIds?: string[];
  technologyIds?: string[];
  allowedOutcomes?: Array<'reacondicionado' | 'reparacion' | 'l3'>;
};

export type WorkshopOperationCatalogs = {
  diagnostics: WorkshopOperationCatalogDiagnostic[];
  repairs: Array<{ id: string; nombre: string }>;
  reacondicionadoTests: unknown[];
  catalogNamesById?: Record<string, string>;
};

/** Incluye versión de contrato (allowedOutcomes) para invalidar caches viejos del cliente. */
export const WORKSHOP_OPERATION_CATALOGS_QUERY_KEY = [
  'workshop-operation-catalogs',
  'v3-reacond-only',
] as const;

export async function fetchWorkshopOperationCatalogsViaApi(): Promise<WorkshopOperationCatalogs> {
  const res = await fetch('/api/v1/catalogs/workshop', {
    credentials: 'include',
    cache: 'no-store',
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return data as WorkshopOperationCatalogs;
}
