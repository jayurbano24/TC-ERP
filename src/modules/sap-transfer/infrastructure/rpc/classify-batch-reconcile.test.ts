import { describe, expect, it } from 'vitest';
import {
  CLASSIFY_TIMEOUT_SAFE_MESSAGE,
  isClassifyLockTimeout,
  isClassifyRpcTimeout,
  reconciledClassifyResult,
} from './classify-batch-reconcile';

describe('classify-batch-reconcile', () => {
  it('55P03 no es reintentable', () => {
    expect(isClassifyLockTimeout('canceling statement due to lock timeout', '55P03')).toBe(true);
    expect(isClassifyRpcTimeout('upstream request timeout', '55P03')).toBe(false);
  });

  it('detecta timeout RPC', () => {
    expect(isClassifyRpcTimeout('upstream request timeout')).toBe(true);
    expect(isClassifyRpcTimeout('Serie duplicada')).toBe(false);
  });

  it('reconciledClassifyResult expone la OS', () => {
    const res = reconciledClassifyResult({
      id: 'os-1',
      main_serial: 'ZTEATV45500264360',
      status: 'INGRESADO',
      reception_id: 'r1',
      sap_transfer_id: 's1',
    });
    expect(res.data).toHaveLength(1);
    expect(res.unitsProcessed).toBe(1);
    expect(res.error).toBeUndefined();
  });

  it('mensaje seguro sin segundo RPC', () => {
    expect(CLASSIFY_TIMEOUT_SAFE_MESSAGE).toMatch(/Finalizar de nuevo/i);
  });
});
