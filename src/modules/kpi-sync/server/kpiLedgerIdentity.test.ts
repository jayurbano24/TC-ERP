import { describe, expect, it } from 'vitest';
import { classifyAuditMetrics } from './auditClassifier';
import { filterFreshLedgerRows, kpiLedgerRowKey } from './kpiLedgerIdentity';

describe('kpiLedgerIdentity', () => {
  it('genera claves distintas por métrica en el mismo audit (QC)', () => {
    const metrics = classifyAuditMetrics({
      action: 'CONTROL DE CALIDAD COMPLETADO',
      new_values: { result: 'rechazado_qc' },
    });
    expect(metrics.length).toBe(2);
    const keys = new Set(
      metrics.map((m) =>
        kpiLedgerRowKey({
          audit_id: 'a1',
          proceso: m.proceso,
          metrica: m.metrica,
          dimension_key: m.dimensionKey ?? 'ALL',
        })
      )
    );
    expect(keys.size).toBe(2);
  });

  it('filterFreshLedgerRows omite solo claves ya presentes', () => {
    const rows = [
      { audit_id: 'a1', proceso: 'taller', metrica: 'qc_completados', dimension_key: 'ALL' },
      { audit_id: 'a1', proceso: 'taller', metrica: 'qc_rechazados', dimension_key: 'ALL' },
    ];
    const existing = new Set([kpiLedgerRowKey(rows[0]!)]);
    const fresh = filterFreshLedgerRows(rows, existing);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.metrica).toBe('qc_rechazados');
  });
});
