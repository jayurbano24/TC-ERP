import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';

/**
 * ADR-011 2C — secreto de dispositivo para /api/iclock/*.
 *
 * Si ICLOCK_DEVICE_SECRET no está definido → modo legacy (permite; log warn una vez).
 * Si está definido → exige header `X-ICLOCK-SECRET` o query `device_key` con timing-safe compare.
 */
let warnedMissingSecret = false;

export function assertIclockDeviceSecret(request: NextRequest): { ok: true } | { ok: false; status: number; body: string } {
  const expected = process.env.ICLOCK_DEVICE_SECRET?.trim() ?? '';
  if (!expected) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn(
        '[iclock] ICLOCK_DEVICE_SECRET no configurado — endpoints públicos (legacy). Configúralo en Vercel.'
      );
    }
    return { ok: true };
  }

  const header = request.headers.get('x-iclock-secret') ?? request.headers.get('X-ICLOCK-SECRET') ?? '';
  const query = request.nextUrl.searchParams.get('device_key') ?? '';
  const provided = header || query;

  if (!provided || !safeEqual(provided, expected)) {
    return { ok: false, status: 401, body: 'UNAUTHORIZED' };
  }
  return { ok: true };
}

const safe = {
  equal(a: string, b: string): boolean {
    try {
      const ba = Buffer.from(a);
      const bb = Buffer.from(b);
      if (ba.length !== bb.length) return false;
      return timingSafeEqual(ba, bb);
    } catch {
      return false;
    }
  },
};
