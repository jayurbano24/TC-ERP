import { z } from 'zod';

/**
 * SEC-P3: validación de entrada para los endpoints ADMS de ZKTeco.
 *
 * Estos endpoints son públicos (los relojes no envían Bearer token) y usan service
 * role. No se rechazan SNs desconocidos para no romper relojes ya desplegados, pero
 * se valida la FORMA del SN y de cada registro antes de tocar la BD, y se acota el
 * volumen por request para evitar abuso. El protocolo espera siempre `text/plain`.
 */

// Tope de líneas procesadas por request (un reloj real envía lotes pequeños).
export const MAX_DEVICE_LINES = 2000;

const snSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.\-:]+$/);

/** Devuelve un SN válido o `null` si falta o tiene formato sospechoso. */
export function parseDeviceSn(searchParams: URLSearchParams): string | null {
  const raw = searchParams.get('SN');
  const result = snSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Valida y normaliza una línea de marcación ATTLOG.
 * Formato: USER_PIN \t CHECK_TIME \t VERIFY_TYPE \t SENSOR_STATUS \t ...
 */
export const attLogRecordSchema = z.object({
  userPin: z.string().trim().min(1).max(64),
  checkTime: z
    .string()
    .trim()
    .transform((value, ctx) => {
      const parsed = new Date(value.replace(' ', 'T') + 'Z');
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: 'custom', message: 'check_time inválido' });
        return z.NEVER;
      }
      return parsed;
    }),
  verifyType: z.coerce.number().int().min(0).max(255).catch(0),
  sensorStatus: z.coerce.number().int().min(0).max(255).catch(0),
});

export type AttLogRecord = z.infer<typeof attLogRecordSchema>;

/** Línea de confirmación de comando: `ID=123&Return=0&CMD=...` */
export const commandResultSchema = z.object({
  ID: z.string().trim().min(1).max(128),
  Return: z.string().trim().max(32).optional().default(''),
});
