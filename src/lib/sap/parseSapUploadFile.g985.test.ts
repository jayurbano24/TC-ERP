import { describe, expect, it } from 'vitest';
import { extractSapMaterial, extractSapValuation } from './parseSapUploadFile';

describe('G985 field mapping', () => {
  it('lee Material como código y Valoración desde Lote/Lote de stock', () => {
    const row = {
      Material: '1005749',
      'Texto breve de material': 'SMART CARD DE NAGRAVISIÓN',
      'Número de serie': '13004394677',
      Centro: 'G985',
      Almacén: 'G000',
      Lote: 'VALORADO',
      'Status del sistema': 'ALMA',
      'Lote de stock': 'VALORADO',
    };
    expect(extractSapMaterial(row)).toBe('1005749');
    expect(extractSapValuation(row)).toBe('VALORADO');
  });

  it('detecta NOVALORAD en Lote aunque Status sea ALMA', () => {
    const row = {
      Material: '4012491',
      'Número de serie': 'F8345AF94A00',
      Lote: 'NOVALORAD',
      'Status del sistema': 'ALMA',
      'Lote de stock': 'NOVALORAD',
    };
    expect(extractSapValuation(row)).toBe('NOVALORAD');
  });

  it('no toma ALMA como valoración', () => {
    const row = {
      Material: '1005749',
      'Número de serie': '13004394677',
      Lote: '',
      'Status del sistema': 'ALMA',
      'Lote de stock': '',
    };
    expect(extractSapValuation(row)).toBe('');
  });
});
