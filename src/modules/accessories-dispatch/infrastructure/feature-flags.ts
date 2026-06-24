export function isHexagonalAccessoriesDispatchEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_USE_HEXAGONAL_ACCESSORIES_DISPATCH === 'true') return true;
  const flags =
    process.env.NEXT_PUBLIC_FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  return flags.includes('USE_HEXAGONAL_ACCESSORIES_DISPATCH');
}

export function isHexagonalAccessoriesDispatchEnabledServer(): boolean {
  if (process.env.USE_HEXAGONAL_ACCESSORIES_DISPATCH === 'true') return true;
  const flags = process.env.FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  return flags.includes('USE_HEXAGONAL_ACCESSORIES_DISPATCH');
}
