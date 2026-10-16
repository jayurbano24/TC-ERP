import { describe, expect, it } from 'vitest';
import {
  buildPrediagnosticoContractRow,
  formatMarcaModeloSku,
  formatPrediagnosticoContractField,
  formatProcedenciaScaReport,
  extractZonaLabel,
  formatVigenciaContract,
  resolveAgenciaRecuperacionSca,
  resolveSkuMaterialSap,
  buildPrediagnosticoExportColumns,
} from './prediagnostico-contract-report';
import { buildPrediagnosticoDynamicCells } from './prediagnostico-export-catalog';

const SAMPLE_CATALOG = [
  { id: 'f1', name: 'Enciende', kind: 'funcionamiento' as const, sortOrder: 10 },
  { id: 'f2', name: 'LEDs', kind: 'funcionamiento' as const, sortOrder: 20 },
];

describe('prediagnostico contract report', () => {
  it('columnas de export dependen del catálogo activo', () => {
    const cols = buildPrediagnosticoExportColumns(SAMPLE_CATALOG);
    expect(cols).toContain('S1');
    expect(cols).toContain('S4');
    expect(cols).toContain('Dictamen');
    expect(cols).toContain('Enciende');
    expect(cols).toContain('LEDs');
    expect(cols).toContain('Clase');
  });

  it('arma fila de ejemplo contractual', () => {
    const checkCells = buildPrediagnosticoDynamicCells({
      items: SAMPLE_CATALOG,
      functionChecks: { f1: 'si' },
      cosmetics: {},
      claseCarcasa: 'A',
    });
    const row = buildPrediagnosticoContractRow({
      numeroIngresoSca: 'TC-20891',
      procedencia: formatProcedenciaScaReport({
        entrySource: 'cac',
        agencyName: 'Aliados Bodega Central Zona 3',
      }),
      agencia: 'ASUNCIÓN MITA',
      marca: 'HUAWEI',
      modelo: 'HG8145X6-10',
      sku: '4817336',
      numeroTrasladoSap: '4900123456',
      serie: '485754432AEB98B0',
      mac: 'FC122CDC9AC9',
      s1: '485754432AEB98B0',
      s2: 'FC122CDC9AC9',
      s3: '',
      s4: '',
      tecnologia: 'GPON',
      vigencia: formatVigenciaContract('', 'vigente'),
      fechaIngreso: '15/10/2026',
      dictamen: 'Reacondición',
      checkCells,
      observaciones: '',
    });
    expect(row.S1).toBe('485754432AEB98B0');
    expect(row.S2).toBe('FC122CDC9AC9');
    expect(row.Marca).toBe('HUAWEI');
    expect(row.SKU).toBe('4817336');
    expect(row.Enciende).toBe('Si');
    expect(row.Clase).toBe('A');
    expect(extractZonaLabel('31 PX ZONA 3, TEL')).toBe('Zona 3');
    expect(
      resolveAgenciaRecuperacionSca({
        entrySource: 'px',
        receptionNotes: '31 PX ZONA 3, TEL',
      })
    ).toBe('Zona 3');
    expect(resolveSkuMaterialSap(null, [{ material: '4817336' }])).toBe('4817336');
    expect(
      formatPrediagnosticoContractField({
        dictamen: 'reacondicionado',
        clase: 'A',
        diagnostico: 'SI SE ENCIENDE',
        accion: 'TAPA DAÑADA',
      })
    ).toContain('Reacondición');
    expect(formatMarcaModeloSku('HUAWEI', 'HG', '123')).toContain('SKU');
  });
});
