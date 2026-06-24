import { NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  generateCorrelationId,
  getCorrelationIdFromHeaders,
} from './correlationId';
import { logApiRequest } from './structuredLog';

export type ApiHandler = (req: Request, ...args: unknown[]) => Promise<NextResponse>;

export type ApiHandlerMeta = {
  module: string;
  action: string;
};

export function withErrorHandler(handler: ApiHandler, meta?: ApiHandlerMeta): ApiHandler {
  return async (req: Request, ...args: unknown[]) => {
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const started = Date.now();

    try {
      const response = await handler(req, ...args);
      const durationMs = Date.now() - started;
      response.headers.set(CORRELATION_ID_HEADER, correlationId);
      response.headers.set('x-response-time-ms', String(durationMs));
      if (meta) {
        logApiRequest({
          module: meta.module,
          action: meta.action,
          correlationId,
          durationMs,
          status: response.status,
        });
      }
      return response;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal Server Error';
      const durationMs = Date.now() - started;
      if (meta) {
        logApiRequest({
          module: meta.module,
          action: meta.action,
          correlationId,
          durationMs,
          status: 500,
          error: message,
        });
      } else {
        console.error('[API Error]', { correlationId, message });
      }
      return NextResponse.json(
        { success: false, error: message, correlationId },
        {
          status: 500,
          headers: {
            [CORRELATION_ID_HEADER]: correlationId,
            'x-response-time-ms': String(durationMs),
          },
        }
      );
    }
  };
}

export function withCorrelation(handler: ApiHandler): ApiHandler {
  return async (req: Request, ...args: unknown[]) => {
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const response = await handler(req, ...args);
    response.headers.set(CORRELATION_ID_HEADER, correlationId);
    return response;
  };
}

export { generateCorrelationId, getCorrelationIdFromHeaders, CORRELATION_ID_HEADER };
