import { describe, expect, it } from 'vitest';
import { findHeaderRowIndex, sheetRowsToObjects } from './catalogExcel';

describe('catalogExcel', () => {
  it('findHeaderRowIndex skips instruction row', () => {
    const rows = [
      ['# Diagnósticos — reparaciones_sugeridas: nombres separados por |.'],
      ['nombre', 'reparaciones_sugeridas'],
      ['NO ENCIENDE', 'Cambio de capacitor'],
    ];
    expect(findHeaderRowIndex(rows)).toBe(1);
  });

  it('sheetRowsToObjects maps excel-like rows', () => {
    const rows = [
      ['Instrucción'],
      ['nombre', 'reparaciones_sugeridas'],
      ['COSMÉTICA DAÑADA', 'Pintura'],
      ['NO ENCIENDE', 'Ajuste de capacitor | Cambio de capacitor'],
    ];
    const objects = sheetRowsToObjects(rows);
    expect(objects).toHaveLength(2);
    expect(objects[0].nombre).toBe('COSMÉTICA DAÑADA');
    expect(objects[1].reparaciones_sugeridas).toContain('Cambio de capacitor');
  });
});
