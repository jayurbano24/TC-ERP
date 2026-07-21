/** Idle máximo sin actividad antes de expulsar del ERP (minutos). */
export const SESSION_IDLE_MINUTES = 45;

/** Intervalo del heartbeat de presencia mientras hay actividad (ms). */
export const SESSION_HEARTBEAT_MS = 60_000;

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
