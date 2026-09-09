import { describe, expect, it } from 'vitest';
import {
  displayTransferNotes,
  isPlaceholderTransferNote,
} from '@/lib/database/returns';

describe('transfer notes — sin placeholder N/A', () => {
  it('detecta N/A y variantes como placeholder', () => {
    expect(isPlaceholderTransferNote('N/A')).toBe(true);
    expect(isPlaceholderTransferNote('n/a')).toBe(true);
    expect(isPlaceholderTransferNote('---')).toBe(true);
    expect(isPlaceholderTransferNote('')).toBe(true);
    expect(isPlaceholderTransferNote('MATERIAL INCORRECTO')).toBe(false);
  });

  it('displayTransferNotes reemplaza N/A por texto amigable', () => {
    expect(displayTransferNotes('N/A')).toBe('Sin notas adicionales');
    expect(displayTransferNotes('EQUIPO FUERA DE PORTAFOLIO')).toBe('EQUIPO FUERA DE PORTAFOLIO');
  });
});
