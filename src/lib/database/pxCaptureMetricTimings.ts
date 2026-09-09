/** Sub-spans de timing devueltos por capture_px_equipment_tx (Fase 5–6B). */

export type PxCaptureRpcTimings = {
  preflight_ms?: number;
  validation_ms?: number;
  lock_wait_ms?: number;
  lock_section_ms?: number;
  insert_ms?: number;
  update_ms?: number;
};

export function extractPxCaptureTimings(
  payload: Record<string, unknown> | null | undefined,
): PxCaptureRpcTimings | null {
  const raw = payload?.timings;
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as PxCaptureRpcTimings;
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  return {
    preflight_ms: num(t.preflight_ms),
    validation_ms: num(t.validation_ms),
    lock_wait_ms: num(t.lock_wait_ms),
    lock_section_ms: num(t.lock_section_ms),
    insert_ms: num(t.insert_ms),
    update_ms: num(t.update_ms),
  };
}

export function buildPxCaptureMetricTimings(
  timings: PxCaptureRpcTimings | null | undefined,
): {
  preflightMs: number | null;
  validationMs: number | null;
  lockWaitMs: number | null;
  lockSectionMs: number | null;
} {
  return {
    preflightMs: timings?.preflight_ms ?? null,
    validationMs: timings?.validation_ms ?? null,
    lockWaitMs: timings?.lock_wait_ms ?? null,
    lockSectionMs: timings?.lock_section_ms ?? null,
  };
}
