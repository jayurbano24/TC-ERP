import { describe, expect, it } from 'vitest';
import {
  countCatalogDuplicates,
  countModelDuplicates,
  dedupeCatalogByName,
  findDuplicateCatalogName,
  findDuplicateModelName,
  normalizeCatalogName,
} from './catalogNameDedup';

describe('catalogNameDedup', () => {
  it('normalizes accents and spacing', () => {
    expect(normalizeCatalogName('  cambio   de   antena  ')).toBe('CAMBIO DE ANTENA');
    expect(normalizeCatalogName('Puerto HDMI dañado')).toBe('PUERTO HDMI DANADO');
  });

  it('dedupes by normalized name keeping first', () => {
    const items = [
      { id: '1', nombre: 'CAMBIO DE FUENTE' },
      { id: '2', nombre: 'cambio de fuente' },
      { id: '3', nombre: 'RESET DE FABRICA' },
    ];
    const out = dedupeCatalogByName(items);
    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe('1');
  });

  it('counts duplicates', () => {
    expect(
      countCatalogDuplicates([
        { id: '1', nombre: 'A' },
        { id: '2', nombre: 'a' },
        { id: '3', nombre: 'B' },
      ]),
    ).toBe(1);
  });

  it('finds duplicate excluding current id', () => {
    const items = [{ id: '1', nombre: 'CAMBIO DE FUENTE' }];
    expect(findDuplicateCatalogName(items, 'Cambio de Fuente', '1')).toBeNull();
    expect(findDuplicateCatalogName(items, 'Cambio de Fuente')).toEqual(items[0]);
  });

  it('finds duplicate model scoped by brand', () => {
    const models = [
      { id: '1', nombre: '3.0 BC-RT905', marcaId: 'brand-a' },
      { id: '2', nombre: '3.0 bc-rt905', marcaId: 'brand-a' },
      { id: '3', nombre: '3.0 BC-RT905', marcaId: 'brand-b' },
    ];
    expect(findDuplicateModelName(models, '3.0 BC-RT905', 'brand-a', '1')).toEqual(models[1]);
    expect(findDuplicateModelName(models, '3.0 BC-RT905', 'brand-b', '3')).toBeNull();
    expect(countModelDuplicates(models)).toBe(1);
  });
});
