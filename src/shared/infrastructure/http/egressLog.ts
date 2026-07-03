import { logApiRequest } from './structuredLog';

export type EgressLogPayload = {
  route: string;
  module: string;
  action: string;
  correlationId: string;
  rowCount: number;
  bytesEstimate?: number;
  durationMs: number;
  status: number;
};

/**
 * Registra métricas de egress por endpoint (Fase 3 observabilidad).
 * Objetivo operativo: listado ≤ 50 KB, detalle ≤ 100 KB.
 */
export function logEgress(payload: EgressLogPayload): void {
  const line = {
    type: 'egress',
    route: payload.route,
    module: payload.module,
    action: payload.action,
    correlationId: payload.correlationId,
    rowCount: payload.rowCount,
    bytesEstimate: payload.bytesEstimate ?? null,
    durationMs: payload.durationMs,
    status: payload.status,
  };
  console.info(JSON.stringify(line));
  logApiRequest({
    module: payload.module,
    action: payload.action,
    correlationId: payload.correlationId,
    durationMs: payload.durationMs,
    status: payload.status,
  });
}

/** Estima bytes de un payload JSON serializado (aproximado). */
export function estimateJsonBytes(data: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(data)).length;
  } catch {
    return 0;
  }
}
