import { describe, expect, it } from 'vitest';
import {
  csvRowsToObjects,
  findCatalogIdByName,
  parseCsvText,
  resolveRepairIdsFromNames,
} from './workshopCatalogCsv';

describe('workshopCatalogCsv', () => {
  it('parses csv with quoted cells', () => {
    const rows = parseCsvText('nombre\n"CAMBIO DE FUENTE"\n');
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe('CAMBIO DE FUENTE');
  });

  it('maps headers to objects without id', () => {
    const objs = csvRowsToObjects([
      ['nombre'],
      ['NUEVA REPARACION'],
    ]);
    expect(objs[0]?.nombre).toBe('NUEVA REPARACION');
  });

  it('finds catalog id by name only', () => {
    const id = findCatalogIdByName('cambio de fuente', [
      { id: 'internal-uuid', nombre: 'CAMBIO DE FUENTE' },
    ]);
    expect(id).toBe('internal-uuid');
  });

  it('resolves repair names to ids', () => {
    const ids = resolveRepairIdsFromNames('CAMBIO DE FUENTE|ajuste de capacitor', [
      { id: 'a', nombre: 'CAMBIO DE FUENTE' },
      { id: 'b', nombre: 'AJUSTE DE CAPACITOR' },
    ]);
    expect(ids).toEqual(['a', 'b']);
  });
});
