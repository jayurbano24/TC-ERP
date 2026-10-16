import { describe, expect, it } from 'vitest';
import { labelPrediagnosticoDictamen } from './prediagnosticoDictamenLabels';

describe('labelPrediagnosticoDictamen', () => {
  it('usa sustantivos SCA en export y UI', () => {
    expect(labelPrediagnosticoDictamen('reparado')).toBe('Reparación');
    expect(labelPrediagnosticoDictamen('reacondicionado')).toBe('Reacondición');
    expect(labelPrediagnosticoDictamen('irreparable')).toBe('Irreparable');
  });
});
