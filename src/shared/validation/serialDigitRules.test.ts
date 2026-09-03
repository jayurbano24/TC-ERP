import { describe, expect, it } from 'vitest';
import {
  getExpectedDigitsForSlot,
  modelHasDigitRules,
  prepareScannedSerial,
  serialLengthCounterLabel,
  stripScannerTerminators,
  validateScanSlotsAgainstDigitRules,
  validateSerialForModelAnySlot,
  validateSerialForModelSlot,
  validateSerialLength,
} from './serialDigitRules';

describe('stripScannerTerminators / prepareScannedSerial', () => {
  it('strips CR LF and CRLF without altering SN body', () => {
    expect(stripScannerTerminators('ABC123\r')).toBe('ABC123');
    expect(stripScannerTerminators('ABC123\n')).toBe('ABC123');
    expect(stripScannerTerminators('ABC123\r\n')).toBe('ABC123');
    expect(prepareScannedSerial('abc123\r\n')).toBe('ABC123');
  });

  it('does not remove legitimate spaces to force length', () => {
    expect(prepareScannedSerial('AB C123')).toBe('AB C123');
  });

  it('does not truncate overflow serials', () => {
    const long = 'ABCDEFGHIJKLMNOPQR'; // 18
    expect(prepareScannedSerial(long)).toBe(long);
    expect(prepareScannedSerial(long).length).toBe(18);
  });
});

describe('validateSerialLength (expected=16)', () => {
  const expected = 16;

  it.each([
    ['14 chars', 'ABCDEFGHIJKLMN', false, 'too_short'],
    ['15 chars', 'ABCDEFGHIJKLMNO', false, 'too_short'],
    ['16 chars', 'ABCDEFGHIJKLMNOP', true, 'ok'],
    ['17 chars', 'ABCDEFGHIJKLMNOPQ', false, 'too_long'],
    ['18 chars', 'ABCDEFGHIJKLMNOPQR', false, 'too_long'],
  ] as const)('%s → %s', (_label, sn, valid, reason) => {
    const r = validateSerialLength(sn, expected);
    expect(r.valid).toBe(valid);
    expect(r.reason).toBe(reason);
    expect(r.expected).toBe(expected);
    expect(r.received).toBe(sn.length);
    if (!valid && reason === 'too_long') {
      expect(r.serial.length).toBe(sn.length);
      expect(r.message).toMatch(/no será truncado/i);
    }
  });

  it('Enter terminator does not count toward length', () => {
    const sn = 'ABCDEFGHIJKLMNOP'; // 16
    const r = validateSerialLength(`${sn}\n`, expected);
    expect(r.valid).toBe(true);
    expect(r.received).toBe(16);
  });

  it('blocks when expected length is missing', () => {
    const r = validateSerialLength('ABCDEFGHIJKLMNOP', null);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('config_missing');
  });
});

describe('validateSerialForModelSlot / AnySlot', () => {
  const model = {
    seriesCount: 2,
    digitsPerSeries: [16, 18],
  };

  it('validates S1 and S2 independently', () => {
    expect(validateSerialForModelSlot('ABCDEFGHIJKLMNOP', model, 0).valid).toBe(true);
    expect(validateSerialForModelSlot('ABCDEFGHIJKLMNOPQR', model, 1).valid).toBe(true);
    expect(validateSerialForModelSlot('ABCDEFGHIJKLMNOP', model, 1).valid).toBe(false);
    expect(validateSerialForModelSlot('ABCDEFGHIJKLMNOPQR', model, 0).valid).toBe(false);
  });

  it('any-slot accepts either configured length', () => {
    expect(validateSerialForModelAnySlot('ABCDEFGHIJKLMNOP', model).valid).toBe(true);
    expect(validateSerialForModelAnySlot('ABCDEFGHIJKLMNOPQR', model).valid).toBe(true);
    expect(validateSerialForModelAnySlot('SHORT', model).valid).toBe(false);
  });

  it('blocks model without digits_per_series', () => {
    const bare = { seriesCount: 1, digitsPerSeries: [] as number[] };
    expect(modelHasDigitRules(bare)).toBe(false);
    const r = validateSerialForModelAnySlot('ABCDEFGHIJKLMNOP', bare);
    expect(r.valid).toBe(false);
    expect(r.reason).toBe('config_missing');
  });
});

describe('validateScanSlotsAgainstDigitRules (persist gate)', () => {
  it('rejects invalid slot on submit', () => {
    const check = validateScanSlotsAgainstDigitRules(['ABCDEFGHIJKLMNOPQR', 'X'], {
      seriesCount: 2,
      digitsPerSeries: [16, 18],
    });
    expect(check.ok).toBe(false);
  });

  it('accepts exact multi-slot', () => {
    const check = validateScanSlotsAgainstDigitRules(
      ['ABCDEFGHIJKLMNOP', 'ABCDEFGHIJKLMNOPQR'],
      { seriesCount: 2, digitsPerSeries: [16, 18] }
    );
    expect(check.ok).toBe(true);
  });

  it('blocks empty digit rules', () => {
    const check = validateScanSlotsAgainstDigitRules(['ABCDEFGHIJKLMNOP'], {
      seriesCount: 1,
      digitsPerSeries: [],
    });
    expect(check.ok).toBe(false);
  });
});

describe('helpers', () => {
  it('getExpectedDigitsForSlot falls back to last configured', () => {
    expect(getExpectedDigitsForSlot([12, 15], 0)).toBe(12);
    expect(getExpectedDigitsForSlot([12, 15], 1)).toBe(15);
    expect(getExpectedDigitsForSlot([12, 15], 3)).toBe(15);
  });

  it('serialLengthCounterLabel', () => {
    expect(serialLengthCounterLabel(15, 16)).toBe('15 / 16');
    expect(serialLengthCounterLabel(16, 16)).toBe('16 / 16 ✓');
    expect(serialLengthCounterLabel(18, 16)).toBe('18 / 16 ⚠️');
  });
});
