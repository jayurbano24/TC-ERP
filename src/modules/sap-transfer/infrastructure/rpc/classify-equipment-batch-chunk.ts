/** 1 equipo por RPC (IPTV multi-serie puede superar timeout PostgREST con 2+). */
export const CLASSIFY_EQUIPMENT_RPC_CHUNK_SIZE = 1;

export function chunkClassifyUnits<T>(units: T[], chunkSize = CLASSIFY_EQUIPMENT_RPC_CHUNK_SIZE): T[][] {
  const size = Math.max(1, chunkSize);
  const chunks: T[][] = [];
  for (let i = 0; i < units.length; i += size) {
    chunks.push(units.slice(i, i + size));
  }
  return chunks;
}

/** Segundo intento: 2s; tercer intento: 4s (attemptIndex 1 y 2). */
export function getClassifyRetryDelayMs(attemptIndex: number): number {
  if (attemptIndex <= 0) return 0;
  return 2000 * attemptIndex;
}

export function isClassifyUpstreamTimeout(message: string): boolean {
  const text = String(message || '').trim();
  if (!text) return false;
  if (/tard[oó] demasiado/i.test(text)) return true;
  return /upstream request timeout|request timeout|timed out|timeout/i.test(text);
}
