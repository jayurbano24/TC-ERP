import { describe, expect, it, beforeEach } from 'vitest';
import {
  enqueuePxBoxCapture,
  getPxBoxQueueSnapshot,
  isPxBoxBusyMessage,
  isPxCaptureTimeoutMessage,
  isPxNetworkCaptureError,
  resetPxBoxCaptureQueuesForTests,
  sleepMs,
} from './pxBoxCaptureQueue';

describe('pxBoxCaptureQueue', () => {
  beforeEach(() => {
    resetPxBoxCaptureQueuesForTests();
  });

  it('serializa tareas de la misma caja', async () => {
    const order: number[] = [];

    const p1 = enqueuePxBoxCapture('box-a', async () => {
      order.push(1);
      await sleepMs(30);
      order.push(2);
    });
    const p2 = enqueuePxBoxCapture('box-a', async () => {
      order.push(3);
    });

    await Promise.all([p1, p2]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('permite paralelo entre cajas distintas', async () => {
    let aRunning = false;
    let bRunning = false;
    let overlap = false;

    const pa = enqueuePxBoxCapture('box-a', async () => {
      aRunning = true;
      await sleepMs(40);
      if (bRunning) overlap = true;
      aRunning = false;
    });
    const pb = enqueuePxBoxCapture('box-b', async () => {
      bRunning = true;
      await sleepMs(40);
      if (aRunning) overlap = true;
      bRunning = false;
    });

    await Promise.all([pa, pb]);
    expect(overlap).toBe(true);
  });

  it('reporta pending mientras hay cola', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const first = enqueuePxBoxCapture('box-c', async () => {
      await gate;
    });
    await sleepMs(5);
    const snap = getPxBoxQueueSnapshot('box-c');
    expect(snap.processing).toBe(true);

    void enqueuePxBoxCapture('box-c', async () => undefined);
    await sleepMs(5);
    expect(getPxBoxQueueSnapshot('box-c').pending).toBeGreaterThanOrEqual(1);

    release();
    await first;
  });

  it('detecta mensajes BOX_BUSY y timeout', () => {
    expect(isPxBoxBusyMessage('BOX_BUSY: test')).toBe(true);
    expect(isPxCaptureTimeoutMessage('La captura tardó demasiado')).toBe(true);
    expect(isPxNetworkCaptureError(new TypeError('Failed to fetch'))).toBe(true);
  });
});
