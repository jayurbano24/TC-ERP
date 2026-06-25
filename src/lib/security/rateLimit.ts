/**
 * Rate limiting (SEC-03) — ventana fija en memoria.
 *
 * Limitador sencillo por clave (normalmente IP + grupo de ruta) pensado para
 * ejecutarse dentro del middleware (Edge runtime): solo usa `Map` y `Date.now()`,
 * sin APIs de Node.
 *
 * Limitación conocida: el estado vive en memoria del proceso/isolate. En un
 * despliegue de instancia única o self-hosted ofrece protección efectiva contra
 * abuso/scraping. Para multi-instancia conviene sustituir el `store` por un
 * backend compartido (Redis/Upstash) manteniendo la misma firma.
 */

type Bucket = { count: number; resetAt: number };

const store = new Map<string, Bucket>();
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

/** Elimina ventanas expiradas para acotar el crecimiento del Map. */
function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms en que se reinicia la ventana. */
  resetAt: number;
  /** Segundos hasta el reinicio (para la cabecera `Retry-After`). */
  retryAfterSec: number;
}

/**
 * Registra un golpe contra la clave indicada y resuelve si está dentro del límite.
 *
 * @param key     Identificador del cliente/grupo (p. ej. `"1.2.3.4:default"`).
 * @param limit   Máximo de peticiones permitidas dentro de la ventana.
 * @param windowMs Tamaño de la ventana en milisegundos.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  sweep(now);

  let bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    store.set(key, bucket);
  }

  bucket.count += 1;
  const remaining = Math.max(0, limit - bucket.count);

  return {
    ok: bucket.count <= limit,
    limit,
    remaining,
    resetAt: bucket.resetAt,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}
