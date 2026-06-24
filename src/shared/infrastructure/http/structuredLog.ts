export type ApiLogPayload = {
  module: string;
  action: string;
  correlationId: string;
  durationMs: number;
  status: number;
  error?: string;
};

export function logApiRequest(payload: ApiLogPayload): void {
  const line = {
    level: payload.status >= 500 || payload.error ? 'error' : 'info',
    type: 'api_request',
    module: payload.module,
    action: payload.action,
    correlationId: payload.correlationId,
    durationMs: payload.durationMs,
    status: payload.status,
    ...(payload.error ? { error: payload.error } : {}),
  };
  if (line.level === 'error') {
    console.error(JSON.stringify(line));
  } else {
    console.info(JSON.stringify(line));
  }
}
