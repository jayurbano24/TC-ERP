import { describe, expect, it } from 'vitest';
import {
  buildPxCaptureMetricTimings,
  extractPxCaptureTimings,
} from '@/lib/database/pxCaptureMetricTimings';
import {
  evaluatePxCaptureSloRow,
  pxCaptureAlertsRequireAction,
  PX_CAPTURE_SLO,
} from './pxCaptureSlos';

describe('pxCaptureSlos', () => {
  it('extrae timings del payload RPC', () => {
    const t = extractPxCaptureTimings({
      ok: true,
      timings: { validation_ms: 120, lock_section_ms: 45, lock_wait_ms: 0 },
    });
    expect(t).toEqual({ validation_ms: 120, lock_section_ms: 45, lock_wait_ms: 0 });
    expect(buildPxCaptureMetricTimings(t)).toEqual({
      preflightMs: null,
      validationMs: 120,
      lockWaitMs: 0,
      lockSectionMs: 45,
    });
  });

  it('detecta breach p95 SUCCESS', () => {
    const breaches = evaluatePxCaptureSloRow({
      outcome: 'success',
      error_code: 'NONE',
      p95_rpc_ms: PX_CAPTURE_SLO.success.p95RpcMs + 1,
    });
    expect(breaches.some((b) => b.metric === 'success_p95_rpc_ms')).toBe(true);
  });

  it('filtra alertas firing', () => {
    const { critical, warning } = pxCaptureAlertsRequireAction([
      { alert_id: 'a', severity: 'ok', observed: 0, threshold: 3 },
      { alert_id: 'b', severity: 'critical', observed: 4, threshold: 3 },
      { alert_id: 'c', severity: 'warning', observed: 1, threshold: 0 },
    ]);
    expect(critical).toHaveLength(1);
    expect(warning).toHaveLength(1);
  });

  it('detecta 57014 sobre umbral diario', () => {
    const breaches = evaluatePxCaptureSloRow({
      outcome: 'error',
      error_code: 'CAPTURE_TIMEOUT',
      timeout_57014_count: 6,
    });
    expect(breaches.some((b) => b.metric === 'timeout_57014_daily')).toBe(true);
  });
});
