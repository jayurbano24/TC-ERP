import { describe, expect, it } from 'vitest';
import {
  computePxClientDurationMs,
  createPxCaptureRequestContext,
  isPxCaptureRequestId,
} from './pxCaptureTracing';

describe('pxCaptureTracing', () => {
  it('crea requestId y timestamp de encolado', () => {
    const ctx = createPxCaptureRequestContext();
    expect(isPxCaptureRequestId(ctx.requestId)).toBe(true);
    expect(ctx.clientEnqueuedAt).toBeLessThanOrEqual(Date.now());
  });

  it('calcula client_duration_ms', () => {
    const started = Date.now() - 250;
    expect(computePxClientDurationMs(started, Date.now())).toBeGreaterThanOrEqual(250);
    expect(computePxClientDurationMs(undefined)).toBeNull();
  });
});
