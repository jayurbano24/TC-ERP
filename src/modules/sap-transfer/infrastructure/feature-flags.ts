export function isAtomicClassifyEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_USE_ATOMIC_CLASSIFY === 'true') return true;
  const flags =
    process.env.NEXT_PUBLIC_FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  return flags.includes('USE_ATOMIC_CLASSIFY');
}

export function isAtomicBlockReturnEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_USE_ATOMIC_BLOCK_RETURN === 'true') return true;
  const flags =
    process.env.NEXT_PUBLIC_FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  return flags.includes('USE_ATOMIC_BLOCK_RETURN');
}
