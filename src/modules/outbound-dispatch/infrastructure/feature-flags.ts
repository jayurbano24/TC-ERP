export function isHexagonalOutboundDispatchEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_USE_HEXAGONAL_OUTBOUND_DISPATCH === 'true') return true;
  const flags =
    process.env.NEXT_PUBLIC_FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  return flags.includes('USE_HEXAGONAL_OUTBOUND_DISPATCH');
}

export function isHexagonalOutboundDispatchEnabledServer(): boolean {
  if (process.env.USE_HEXAGONAL_OUTBOUND_DISPATCH === 'true') return true;
  const flags = process.env.FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  return flags.includes('USE_HEXAGONAL_OUTBOUND_DISPATCH');
}

/** Lotes compartidos: equipos (outbound) o accesorios. */
export function isDispatchBatchApiEnabledServer(): boolean {
  if (isHexagonalOutboundDispatchEnabledServer()) return true;
  if (process.env.USE_HEXAGONAL_ACCESSORIES_DISPATCH === 'true') return true;
  const flags = process.env.FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  return flags.includes('USE_HEXAGONAL_ACCESSORIES_DISPATCH');
}
