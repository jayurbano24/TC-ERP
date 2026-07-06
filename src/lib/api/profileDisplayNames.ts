import { apiFetch } from '@/lib/http/apiFetch';

/** Nombres de operadores vía API (bypass RLS de profiles en el navegador). */
export async function fetchProfileDisplayNames(
  userIds: string[]
): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const params = new URLSearchParams({ ids: ids.join(',') });
  const res = await apiFetch(`/api/v1/profiles/display-names?${params}`, { cache: 'no-store' });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? data.detail ?? `HTTP ${res.status}`);
  }
  return (data.names ?? {}) as Record<string, string>;
}
