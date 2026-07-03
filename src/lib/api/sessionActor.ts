import { apiFetch } from '@/lib/http/apiFetch';

export type SessionActor = {
  userId: string;
  fullName: string;
};

let cachedActor: SessionActor | null = null;
let cacheTs = 0;
const CACHE_MS = 60_000;

/** Operador de sesión vía API (cero select Supabase en cliente). */
export async function fetchSessionActor(options?: { fresh?: boolean }): Promise<SessionActor | null> {
  if (!options?.fresh && cachedActor && Date.now() - cacheTs < CACHE_MS) {
    return cachedActor;
  }

  try {
    const res = await apiFetch('/api/v1/session/actor', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as SessionActor;
    if (!data?.userId) return null;
    cachedActor = data;
    cacheTs = Date.now();
    return data;
  } catch {
    return null;
  }
}

export function clearSessionActorCache(): void {
  cachedActor = null;
  cacheTs = 0;
}
