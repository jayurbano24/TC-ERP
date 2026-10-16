import { describe, expect, it } from 'vitest';
import {
  buildPrediagnosticoDynamicCells,
  buildPrediagnosticoExportColumns,
  resolvePrediagnosticoExportItems,
} from './prediagnostico-export-catalog';
import type { PrediagnosticoCheckItem } from './prediagnostico-report-format';

const CATALOG: PrediagnosticoCheckItem[] = [
  { id: 'e1', name: 'Enciende', kind: 'funcionamiento', sortOrder: 10 },
  { id: 'e2', name: 'LEDs', kind: 'funcionamiento', sortOrder: 20 },
  { id: 'c1', name: 'Etiqueta', kind: 'cosmetico', sortOrder: 30 },
];

describe('prediagnostico export catalog', () => {
  it('genera columnas en orden del catálogo', () => {
    const cols = buildPrediagnosticoExportColumns(CATALOG);
    expect(cols).toContain('Enciende');
    expect(cols).toContain('LEDs');
    expect(cols.indexOf('Enciende')).toBeLessThan(cols.indexOf('Etiqueta'));
    expect(cols[cols.length - 2]).toBe('Clase');
    expect(cols[cols.length - 1]).toBe('Observaciones');
  });

  it('exporta Si/No por nombre de ítem del catálogo', () => {
    const cells = buildPrediagnosticoDynamicCells({
      items: CATALOG,
      functionChecks: { e1: 'si', e2: 'no' },
      cosmetics: { c1: 'bien' },
      claseCarcasa: 'B',
    });
    expect(cells.Enciende).toBe('Si');
    expect(cells.LEDs).toBe('No');
    expect(cells.Etiqueta).toBe('Si');
    expect(cells.Clase).toBe('B');
  });

  it('respeta perfil por modelo en encabezados', () => {
    const profiles = new Map<string, string[]>([['model-a', ['e1']]]);
    const items = resolvePrediagnosticoExportItems({
      catalog: CATALOG,
      modelItemProfiles: profiles,
      modelIdFilter: 'model-a',
    });
    expect(items.map((i) => i.id)).toEqual(['e1']);
  });
});
