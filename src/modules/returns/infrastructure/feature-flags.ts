export function isLegacyReturnsEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_USE_LEGACY_RETURNS === 'true') return true;
  const flags =
    process.env.NEXT_PUBLIC_FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  return flags.includes('USE_LEGACY_RETURNS');
}

/** C2A-04: módulo returns hexagonal por defecto; opt-out con USE_LEGACY_RETURNS. */
export function isHexagonalReturnsEnabled(): boolean {
  if (isLegacyReturnsEnabled()) return false;
  if (process.env.NEXT_PUBLIC_USE_HEXAGONAL_RETURNS === 'false') return false;
  if (process.env.NEXT_PUBLIC_USE_HEXAGONAL_RETURNS === 'true') return true;
  const flags =
    process.env.NEXT_PUBLIC_FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  if (flags.includes('USE_HEXAGONAL_RETURNS')) return true;
  return true;
}
