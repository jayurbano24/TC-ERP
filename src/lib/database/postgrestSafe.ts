/**
 * Utilidades para construir filtros PostgREST con input de usuario de forma segura.
 *
 * PostgREST interpreta el string de `.or()` / `.filter()` como una gramática
 * (`columna.operador.valor`, condiciones separadas por comas y agrupadas con
 * paréntesis). Interpolar input de usuario sin limpiar permite **inyección de
 * filtros**: un valor con `,` `(` `)` puede salir del contexto de la condición y
 * alterar la consulta o filtrar datos no autorizados; `%` y `*` inyectan
 * comodines en `like`/`ilike`.
 *
 * `sanitizeOrFilterValue` elimina únicamente los caracteres con significado en la
 * gramática del filtro, preservando letras (incluidas acentuadas), dígitos,
 * espacios y separadores comunes de series/códigos. Es una lista de denegación
 * deliberadamente acotada para no romper búsquedas legítimas.
 */
const POSTGREST_FILTER_UNSAFE = /[,()*%:"\\\r\n]/g;

export function sanitizeOrFilterValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(POSTGREST_FILTER_UNSAFE, '').trim();
}
