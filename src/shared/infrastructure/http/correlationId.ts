import { randomUUID } from 'crypto';

const HEADER = 'x-correlation-id';
const REQUEST_HEADER = 'x-request-id';

export function generateCorrelationId(): string {
  return randomUUID();
}

export function getCorrelationIdFromHeaders(headers: Headers): string {
  return headers.get(HEADER) || headers.get(REQUEST_HEADER) || generateCorrelationId();
}

export function correlationHeaders(correlationId: string): Record<string, string> {
  return {
    [HEADER]: correlationId,
    [REQUEST_HEADER]: correlationId,
  };
}

export const CORRELATION_ID_HEADER = HEADER;
