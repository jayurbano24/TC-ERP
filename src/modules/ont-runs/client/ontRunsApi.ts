import { apiFetch, readApiJson } from '@/lib/http/apiFetch';
import type { OntRun, OntRunsListFilters, OntRunsListResponse } from '../domain/types';

export function buildOntRunsQueryString(filters: OntRunsListFilters): string {
  const sp = new URLSearchParams();
  if (filters.q?.trim()) sp.set('q', filters.q.trim());
  if (!filters.allData) {
    if (filters.from) sp.set('from', filters.from);
    if (filters.to) sp.set('to', filters.to);
  }
  if (filters.verdict?.trim()) sp.set('verdict', filters.verdict.trim());
  else if (filters.hideNotRun) sp.set('hideNotRun', '1');
  if (filters.deviceType?.trim()) sp.set('deviceType', filters.deviceType.trim());
  if (filters.station?.trim()) sp.set('station', filters.station.trim());
  if (filters.page != null) sp.set('page', String(filters.page));
  if (filters.limit != null) sp.set('limit', String(filters.limit));
  if (filters.allData) sp.set('all', '1');
  return sp.toString();
}

export async function fetchAllOntRuns(
  filters: Omit<OntRunsListFilters, 'page' | 'limit'>
): Promise<{ rows: OntRun[]; truncated: boolean }> {
  const qs = buildOntRunsQueryString({ ...filters, allData: true });
  const res = await apiFetch(`/api/v1/ont-runs?${qs}`, { cache: 'no-store' });
  return readApiJson<{ rows: OntRun[]; truncated: boolean }>(res);
}

export async function fetchOntRunsPage(filters: OntRunsListFilters): Promise<OntRunsListResponse> {
  const qs = buildOntRunsQueryString(filters);
  const res = await apiFetch(`/api/v1/ont-runs?${qs}`, { cache: 'no-store' });
  return readApiJson<OntRunsListResponse>(res);
}

export async function fetchOntRunByRunId(runId: string): Promise<OntRun | null> {
  const id = encodeURIComponent(runId.trim());
  const res = await apiFetch(`/api/v1/ont-runs/${id}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  const body = await readApiJson<{ row: OntRun }>(res);
  return body.row;
}
