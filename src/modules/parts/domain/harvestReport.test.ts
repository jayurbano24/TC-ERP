import { describe, expect, it } from 'vitest';
import { buildBoomHvExcelRows, buildHarvestReportCsv, flattenBoomHvRows } from './harvestReport';

describe('buildHarvestReportCsv', () => {
  it('genera una fila por pieza con caso, donante y operador', () => {
    const csv = buildHarvestReportCsv([{ id: 'session-1', case_id: 'case-1', created_at: '2026-10-23T10:00:00Z', os_label: 'TC-10', serial_number: 'SN-1', donor_status: 'scrapped', created_by_name: 'Ana', notes: 'Chasis', lines: [{ qty: 2, notes: 'Carcasa frontal', catalog: { sku: 'CAR-01', name: 'Carcasa' } }] }]);
    expect(csv).toContain('Caso,Fecha,Operador,OS donante,Serie donante,Marca,Modelo,Tecnologia,SKU,Pieza,Cantidad,Nota de pieza,Notas del caso');
    expect(csv).toContain('case-1');
    expect(csv).toContain('SN-1');
    expect(csv).toContain('CAR-01');
  });

  it('genera Boom HV con marca, modelo, tecnologia y una fila por pieza retirada', () => {
    const rows = flattenBoomHvRows([{
      id: 'session-1',
      case_id: 'case-1',
      created_at: '2026-10-23T10:00:00Z',
      os_label: 'TC-10',
      serial_number: 'SN-1',
      brand_name: 'ZTE',
      model_name: 'ZXV10 B866V',
      technology_name: 'STB',
      lines: [
        { qty: 1, catalog: { sku: 'HDMI-01', name: 'Puerto HDMI' } },
        { qty: 2, catalog: { sku: 'USB-01', name: 'Puerto USB' } },
      ],
    }]);

    expect(rows).toEqual([
      expect.objectContaining({ brand: 'ZTE', model: 'ZXV10 B866V', technology: 'STB', sku: 'HDMI-01', part: 'Puerto HDMI', quantity: 1 }),
      expect.objectContaining({ brand: 'ZTE', model: 'ZXV10 B866V', technology: 'STB', sku: 'USB-01', part: 'Puerto USB', quantity: 2 }),
    ]);

    const csv = buildHarvestReportCsv([{
      id: 'session-1', brand_name: 'ZTE', model_name: 'ZXV10 B866V', technology_name: 'STB',
      lines: [{ qty: 1, catalog: { sku: 'HDMI-01', name: 'Puerto HDMI' } }],
    }]);
    expect(csv).toContain('Marca,Modelo,Tecnologia');
    expect(csv).toContain('ZTE,ZXV10 B866V,STB');
  });

  it('prepara columnas legibles para exportar Boom HV a Excel', () => {
    const excelRows = buildBoomHvExcelRows([{
      id: 'session-1',
      brand_name: 'ZTE',
      model_name: 'ZXV10 B866V',
      technology_name: 'STB',
      serial_number: 'SN-1',
      lines: [{ qty: 1, catalog: { sku: 'USB-01', name: 'Puerto USB' } }],
    }]);

    expect(excelRows).toEqual([expect.objectContaining({
      Marca: 'ZTE',
      Modelo: 'ZXV10 B866V',
      Tecnologia: 'STB',
      'Serie donante': 'SN-1',
      SKU: 'USB-01',
      'Pieza retirada': 'Puerto USB',
      Cantidad: 1,
    })]);
  });
});
