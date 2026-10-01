import { describe, expect, it } from 'vitest';
import { assertUniformBatch, batchSelectionError } from './batchSelection';

const iptv = { serviceOrderId: 'os-1', techId: 'iptv', modelId: 'zx10' };
const same = { serviceOrderId: 'os-2', techId: 'iptv', modelId: 'zx10' };
const otherModel = { serviceOrderId: 'os-3', techId: 'iptv', modelId: 'hg8' };
const otherTech = { serviceOrderId: 'os-4', techId: 'ont', modelId: 'zx10' };

describe('batchSelectionError', () => {
  it('acepta otro equipo del mismo modelo y tecnología', () => {
    expect(batchSelectionError([iptv], same)).toBeNull();
  });

  it('rechaza otro modelo o otra tecnología', () => {
    expect(batchSelectionError([iptv], otherModel)).toMatch(/mismo modelo y tecnología/);
    expect(batchSelectionError([iptv], otherTech)).toMatch(/mismo modelo y tecnología/);
  });

  it('rechaza el equipo 26', () => {
    const selected = Array.from({ length: 25 }, (_, index) => ({
      serviceOrderId: `os-${index}`,
      techId: 'iptv',
      modelId: 'zx10',
    }));
    expect(batchSelectionError(selected, { serviceOrderId: 'os-25', techId: 'iptv', modelId: 'zx10' })).toMatch(/Máximo 25/);
  });
});

describe('assertUniformBatch', () => {
  it('exige que todas las órdenes pedidas compartan modelo y tecnología', () => {
    expect(assertUniformBatch([iptv, same], ['os-1', 'os-2'])).toBeNull();
    expect(assertUniformBatch([iptv, otherModel], ['os-1', 'os-3'])).toMatch(/mismo modelo y tecnología/);
    expect(assertUniformBatch([iptv], ['os-1', 'os-2'])).toMatch(/no está en el historial/);
  });
});
