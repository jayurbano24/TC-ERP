import { describe, expect, it } from 'vitest';
import { normalizeSerial } from './normalizeSerial';

describe('normalizeSerial', () => {
  it('uppercases and trims', () => {
    expect(normalizeSerial('  abc123  ')).toBe('ABC123');
  });

  it('removes internal spaces and control chars', () => {
    expect(normalizeSerial('AB C\n12\t3')).toBe('ABC123');
  });

  it('handles null/undefined', () => {
    expect(normalizeSerial(null)).toBe('');
    expect(normalizeSerial(undefined)).toBe('');
  });

  it('keeps hex-like serials intact (E is not scientific alone)', () => {
    expect(normalizeSerial('48575443803E3CA8')).toBe('48575443803E3CA8');
  });

  it('expands scientific notation from Excel', () => {
    expect(normalizeSerial('1.23E+5')).toBe('123000');
  });
});
