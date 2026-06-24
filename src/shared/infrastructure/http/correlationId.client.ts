/** UUID de correlación en el navegador (flujos CAC sin API Next). */
export function generateClientCorrelationId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
