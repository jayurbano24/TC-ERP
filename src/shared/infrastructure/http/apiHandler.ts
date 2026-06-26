import { NextResponse } from 'next/server';
import {
  CORRELATION_ID_HEADER,
  generateCorrelationId,
  getCorrelationIdFromHeaders,
} from './correlationId';
import { logApiRequest } from './structuredLog';
import {
  ValidationException,
  BusinessException,
  DomainException,
} from '../../errors/Exceptions';

/**
 * Traduce una excepción a una respuesta segura para el cliente.
 *
 * Solo las excepciones de dominio/validación exponen su mensaje (son seguras y
 * accionables). Cualquier otro error devuelve un mensaje genérico para evitar
 * fuga de información (detalles de BD, stack traces, rutas internas); el detalle
 * real se registra del lado del servidor.
 */
function toClientError(error: unknown): { status: number; message: string; issues?: unknown } {
  if (error instanceof ValidationException) {
    return { status: 400, message: error.message, issues: error.errors };
  }
  if (error instanceof BusinessException) {
    return { status: 409, message: error.message };
  }
  if (error instanceof DomainException) {
    return { status: 400, message: error.message };
  }
  return { status: 500, message: 'Error interno del servidor' };
}

export type ApiHandler<A extends unknown[] = unknown[]> = (
  req: Request,
  ...args: A
) => Promise<NextResponse>;

export type ApiHandlerMeta = {
  module: string;
  action: string;
};

export function withErrorHandler<A extends unknown[]>(
  handler: ApiHandler<A>,
  meta?: ApiHandlerMeta
): ApiHandler<A> {
  return async (req: Request, ...args: A) => {
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
      const internalMessage = error instanceof Error ? error.message : 'Internal Server Error';
      const clientError = toClientError(error);
      const durationMs = Date.now() - started;
      if (meta) {
        logApiRequest({
          module: meta.module,
          action: meta.action,
          correlationId,
          durationMs,
          status: clientError.status,
          error: internalMessage,
        });
      } else {
        console.error('[API Error]', { correlationId, message: internalMessage });
      }
      return NextResponse.json(
        { success: false, error: clientError.message, issues: clientError.issues, correlationId },
        {
          status: clientError.status,
          headers: {
            [CORRELATION_ID_HEADER]: correlationId,
            'x-response-time-ms': String(durationMs),
          },
        }
      );
    }
  };
}

export function withCorrelation<A extends unknown[]>(handler: ApiHandler<A>): ApiHandler<A> {
  return async (req: Request, ...args: A) => {
    const correlationId = getCorrelationIdFromHeaders(req.headers);
    const response = await handler(req, ...args);
    response.headers.set(CORRELATION_ID_HEADER, correlationId);
    return response;
  };
}

export { generateCorrelationId, getCorrelationIdFromHeaders, CORRELATION_ID_HEADER };
