/** Máximo de equipos por llamada RPC (evita upstream timeout de PostgREST ~120s). */
export const CLASSIFY_EQUIPMENT_RPC_CHUNK_SIZE = 2;

export function chunkClassifyUnits<T>(units: T[], chunkSize = CLASSIFY_EQUIPMENT_RPC_CHUNK_SIZE): T[][] {
  const size = Math.max(1, chunkSize);
  const chunks: T[][] = [];
  for (let i = 0; i < units.length; i += size) {
    chunks.push(units.slice(i, i + size));
  }
  return chunks;
}

export function isClassifyUpstreamTimeout(message: string): boolean {
  return /upstream request timeout|request timeout|timed out|timeout/i.test(message);
}
