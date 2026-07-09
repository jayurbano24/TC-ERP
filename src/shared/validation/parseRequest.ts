import { z } from 'zod';
import { ValidationException } from '../errors/Exceptions';

/**
 * Lee y valida el cuerpo JSON de una `Request` contra un esquema Zod.
 *
 * Centraliza la validación en el borde HTTP: garantiza que ningún handler procese
 * input sin tipar/validar y lanza `ValidationException` (mapeada a HTTP 400 por
 * `withErrorHandler`) con mensajes seguros para el cliente.
 */
export async function parseJsonBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationException('Cuerpo de la solicitud inválido (JSON malformado).');
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 8).map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    console.warn('[parseJsonBody] validation failed', issues);
    throw new ValidationException('Validación de datos fallida.', issues);
  }
  return result.data;
}

/**
 * Igual que `parseJsonBody` pero tolera cuerpos vacíos o ausentes (JSON malformado
 * se trata como `{}`). Útil para endpoints donde el body es opcional (p.ej. acciones
 * que solo requieren parámetros de ruta y, opcionalmente, datos de operador).
 */
export async function parseOptionalJsonBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    throw new ValidationException(
      'Validación de datos fallida.',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
    );
  }
  return result.data;
}

/**
 * Valida los parámetros de búsqueda (query string) contra un esquema Zod.
 */
export function parseQueryParams<T>(req: Request, schema: z.ZodType<T>): T {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries());
  const result = schema.safeParse(params);
  if (!result.success) {
    throw new ValidationException(
      'Parámetros de consulta inválidos.',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }))
    );
  }
  return result.data;
}
