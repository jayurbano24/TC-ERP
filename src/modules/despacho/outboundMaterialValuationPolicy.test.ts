import { describe, expect, it } from 'vitest';
import {
  classifyValuationBucket,
  materialsConflictForOutbound,
  outboundValuationsMatch,
  isIptvTechnologyName,
} from './outboundMaterialValuationPolicy';

describe('outbound IPTV material policy', () => {
  it('detects IPTV technology', () => {
    expect(isIptvTechnologyName('IPTV')).toBe(true);
    expect(isIptvTechnologyName('iptv')).toBe(true);
    expect(isIptvTechnologyName('DTH')).toBe(false);
  });

  it('allows different materials when allowMultiMaterial', () => {
    expect(
      materialsConflictForOutbound('4013099', 'VALORADO', '4016338', 'VALORADO', {
        allowMultiMaterial: true,
      })
    ).toBe(false);
    expect(
      materialsConflictForOutbound('4013099', 'VALORADO', '4016338', 'NO VALORADO', {
        allowMultiMaterial: true,
      })
    ).toBe(true);
  });

  it('blocks mixed materials when not IPTV', () => {
    expect(
      materialsConflictForOutbound('4013099', 'X', '4016338', 'X', {
        allowMultiMaterial: false,
      })
    ).toBe(true);
  });

  it('matches valorado buckets across SAP labels', () => {
    expect(outboundValuationsMatch('VALORADO', 'EQUIPO VALORADO')).toBe(true);
    expect(outboundValuationsMatch('NO VALORADO', 'NOVALORADO')).toBe(true);
    expect(outboundValuationsMatch('VALORADO', 'NO VALORADO')).toBe(false);
    expect(classifyValuationBucket('Lote Valorado SAP')).toBe('valorado');
  });
});
