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

export type WorkshopOperationCatalogs = {
  diagnostics: Array<{ id: string; nombre: string; reparacionesIds?: string[] }>;
  repairs: Array<{ id: string; nombre: string }>;
  reacondicionadoTests: unknown[];
};

export async function fetchWorkshopOperationCatalogsViaApi(): Promise<WorkshopOperationCatalogs> {
  const res = await fetch('/api/v1/catalogs/workshop', { credentials: 'include' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return data as WorkshopOperationCatalogs;
}
