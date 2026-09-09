import { describe, expect, it } from 'vitest';
import { buildPxCaptureMetricTimings, extractPxCaptureTimings } from './pxCaptureMetricTimings';

describe('pxCaptureMetricTimings', () => {
  it('extrae validation_ms y lock_section_ms del payload RPC', () => {
    const t = extractPxCaptureTimings({
      ok: true,
      timings: {
        preflight_ms: 10,
        validation_ms: 88,
        lock_wait_ms: 2,
        lock_section_ms: 22,
        insert_ms: 12,
        update_ms: 4,
      },
    });
    expect(t?.preflight_ms).toBe(10);
    expect(buildPxCaptureMetricTimings(t)).toEqual({
      preflightMs: 10,
      validationMs: 88,
      lockWaitMs: 2,
      lockSectionMs: 22,
    });
  });

  it('retorna null si no hay timings', () => {
    expect(extractPxCaptureTimings({ ok: true })).toBeNull();
  });
});
