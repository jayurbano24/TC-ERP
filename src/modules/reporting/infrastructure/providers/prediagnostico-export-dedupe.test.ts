import { describe, expect, it } from 'vitest';
import {
  dedupePrediagnosticoContractRows,
  dedupeSeriesRowsForPrediagnosticoExport,
} from './prediagnostico-export-dedupe';

describe('prediagnostico export dedupe', () => {
  it('dedupe series by serial keeping newest created_at', () => {
    const rows = dedupeSeriesRowsForPrediagnosticoExport([
      { id: 'a', serial_number: 'SN1', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', serial_number: 'SN1', created_at: '2026-03-01T00:00:00Z' },
      { id: 'c', serial_number: 'SN2', created_at: '2026-01-01T00:00:00Z' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.serial_number === 'SN1')?.id).toBe('b');
  });

  it('dedupe contract rows by OS (una fila con S1–S4)', () => {
    const base = {
      Procedencia: 'X',
      Marca: 'ZTE',
      Modelo: 'M',
      SKU: 'S',
      'Número de traslado SAP': '',
      MAC: '',
      Tecnología: '',
      Vigencia: '',
      'Fecha de ingreso': '',
      Dictamen: '',
      Observaciones: '',
    };
    const rows = dedupePrediagnosticoContractRows([
      { ...base, 'Número de ingreso al SCA': 'TC-87318', Serie: 'ABC', S1: 'ABC' },
      { ...base, 'Número de ingreso al SCA': 'TC-87318', Serie: 'ABC', S1: 'ABC' },
      { ...base, 'Número de ingreso al SCA': 'TC-87309', Serie: 'XYZ', S1: 'XYZ' },
    ]);
    expect(rows).toHaveLength(2);
  });
});
