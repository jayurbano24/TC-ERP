import { describe, expect, it } from 'vitest';
import { expandOperationalRoles } from './roleGuard';

describe('expandOperationalRoles', () => {
  it('mapea TECNICO JUNIOR / SENIOR a tecnico', () => {
    expect(expandOperationalRoles(['TECNICO JUNIOR'])).toEqual(
      expect.arrayContaining(['TECNICO JUNIOR', 'tecnico'])
    );
    expect(expandOperationalRoles(['TECNICO SENIOR'])).toEqual(
      expect.arrayContaining(['TECNICO SENIOR', 'tecnico'])
    );
  });

  it('respeta el enum operacional ya presente', () => {
    expect(expandOperationalRoles(['tecnico'])).toEqual(['tecnico']);
  });

  it('mapea puestos QC a qc', () => {
    expect(expandOperationalRoles(['ANALISTA QC'])).toEqual(
      expect.arrayContaining(['ANALISTA QC', 'qc'])
    );
  });
});
