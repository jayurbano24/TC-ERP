/**
 * Idle máximo sin presencia antes de expulsar del ERP (minutos).
 * Con pestaña visible el heartbeat renueva `last_seen`; este tope aplica
 * sobre todo cuando la pestaña está en segundo plano / PC bloqueada.
 */
export const SESSION_IDLE_MINUTES = 240;

/** Intervalo del heartbeat de presencia mientras hay actividad (ms).
 * 3 min: suficiente para idle 240 min y reduce ~3× las Edge Requests de /api/user-session. */
export const SESSION_HEARTBEAT_MS = 180_000;

/** Throttle de eventos de actividad en el cliente (ms). */
export const SESSION_ACTIVITY_THROTTLE_MS = 15_000;

export function sessionIdleCutoffIso(now = Date.now()): string {
  return new Date(now - SESSION_IDLE_MINUTES * 60_000).toISOString();
}

export function isSessionIdle(lastSeenIso: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenIso) return true;
  const t = new Date(lastSeenIso).getTime();
  if (Number.isNaN(t)) return true;
  return now - t >= SESSION_IDLE_MINUTES * 60_000;
}
