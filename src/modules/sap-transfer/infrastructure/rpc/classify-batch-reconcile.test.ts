import { describe, expect, it } from 'vitest';
import {
  CLASSIFY_TIMEOUT_SAFE_MESSAGE,
  isEquivalentReconciledOrder,
  isClassifyLockTimeout,
  isClassifyIdentityMismatch,
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

  it('reconcilia un reintento con UUID SAP distinto cuando documento e identidad S1-S3 coinciden', () => {
    expect(isClassifyIdentityMismatch('La identidad S1-S4 o el contexto recepciÃ³n/SAP no coincide')).toBe(true);
    expect(isEquivalentReconciledOrder({
      targetSapDocument: '418845465/4',
      expectedSeries: ['M1934ER01847', '12E000158586', '2240001410438230'],
      candidateSapDocument: ' 418845465/4 ',
      candidateSeries: ['2240001410438230', 'M1934ER01847', '12E000158586'],
    })).toBe(true);
  });

  it('no reconcilia si cambia el documento SAP o una serie del equipo', () => {
    const base = {
      targetSapDocument: '418845465/4',
      expectedSeries: ['M1934ER01847', '12E000158586', '2240001410438230'],
    };
    expect(isEquivalentReconciledOrder({
      ...base,
      candidateSapDocument: '418845465/5',
      candidateSeries: base.expectedSeries,
    })).toBe(false);
    expect(isEquivalentReconciledOrder({
      ...base,
      candidateSapDocument: '418845465/4',
      candidateSeries: ['M1934ER01847', '12E000158586', 'OTRA-S3'],
    })).toBe(false);
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
