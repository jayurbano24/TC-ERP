export function isCentralReportingEnabledClient(): boolean {
  if (process.env.NEXT_PUBLIC_USE_CENTRAL_REPORTING?.trim() === 'true') return true;
  const flags = process.env.NEXT_PUBLIC_FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  return flags.includes('USE_CENTRAL_REPORTING');
}

export function isCentralReportingEnabledServer(): boolean {
  if (process.env.USE_CENTRAL_REPORTING?.trim() === 'true') return true;
  const flags = process.env.FEATURE_FLAGS?.split(',').map((f) => f.trim()) ?? [];
  return flags.includes('USE_CENTRAL_REPORTING');
}
