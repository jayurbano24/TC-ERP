export function formatFetchError(err: unknown, fallback = 'Error de conexión'): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
    return 'No se pudo conectar con el servidor. Verifique su conexión e intente de nuevo.';
  }
  return msg || fallback;
}

/** Reintenta una operación async ante fallos de red transitorios. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: { attempts?: number; baseDelayMs?: number }
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 600;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        msg.includes('Failed to fetch') ||
        msg.includes('NetworkError') ||
        msg.includes('Load failed') ||
        msg.includes('timeout');

      if (!isRetryable || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }

  throw lastErr;
}
