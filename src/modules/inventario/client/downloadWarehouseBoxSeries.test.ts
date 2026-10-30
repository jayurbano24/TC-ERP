import { describe, expect, it } from 'vitest';
import { buildWarehouseBoxSeriesExcelRows } from './downloadWarehouseBoxSeries';

describe('buildWarehouseBoxSeriesExcelRows', () => {
  it('mapea labels de catálogo y S1–S4', () => {
    const rows = buildWarehouseBoxSeriesExcelRows(
      [
        {
          ordenServicio: 'TC-GT-1',
          s1: 'SN1',
          s2: 'SN2',
          tecnologia: 'tech-1',
          marca: 'brand-1',
          modelo: 'model-1',
          current_status: 'in_central_warehouse',
          guia: 'G-9',
        },
      ],
      {
        technologies: new Map([['tech-1', 'ONT']]),
        brands: new Map([['brand-1', 'KAON']]),
        models: new Map([['model-1', 'CG-2200']]),
      }
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      '#': 1,
      'Orden Servicio': 'TC-GT-1',
      'S-1': 'SN1',
      'S-2': 'SN2',
      Tecnología: 'ONT',
      Marca: 'KAON',
      Modelo: 'CG-2200',
      Estatus: 'BODEGA PRINCIPAL',
      'No. Guía': 'G-9',
    });
  });

  it('prefiere tecnologiaLabel/marcaLabel/modeloLabel sobre ids', () => {
    const rows = buildWarehouseBoxSeriesExcelRows([
      {
        s1: 'ABC',
        tecnologia: 'uuid',
        tecnologiaLabel: 'EMTA',
        marcaLabel: 'ARRIS',
        modeloLabel: 'TM1602',
      },
    ]);
    expect(rows[0]?.Tecnología).toBe('EMTA');
    expect(rows[0]?.Marca).toBe('ARRIS');
    expect(rows[0]?.Modelo).toBe('TM1602');
  });
});
