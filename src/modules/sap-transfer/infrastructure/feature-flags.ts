export function isLegacySapTransferEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_USE_LEGACY_SAP_TRANSFER === 'true') return true;
  const flags =
    process.env.NEXT_PUBLIC_FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  return flags.includes('USE_LEGACY_SAP_TRANSFER');
}

/** C2A-02: hexagonal + RPC atómico por defecto; opt-out con USE_LEGACY_SAP_TRANSFER. */
export function isHexagonalSapTransferEnabled(): boolean {
  if (isLegacySapTransferEnabled()) return false;
  if (process.env.NEXT_PUBLIC_USE_HEXAGONAL_SAP_TRANSFER === 'false') return false;
  if (process.env.NEXT_PUBLIC_USE_HEXAGONAL_SAP_TRANSFER === 'true') return true;
  const flags =
    process.env.NEXT_PUBLIC_FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  if (flags.includes('USE_HEXAGONAL_SAP_TRANSFER')) return true;
  return true;
}

export function isAtomicClassifyEnabled(): boolean {
  return isHexagonalSapTransferEnabled();
}

export function isAtomicBlockReturnEnabled(): boolean {
  return isHexagonalSapTransferEnabled();
}
