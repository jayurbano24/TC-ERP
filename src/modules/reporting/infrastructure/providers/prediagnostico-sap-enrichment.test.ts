import { describe, expect, it } from 'vitest';
import {
  resolveNumeroTrasladoSap,
  resolvePrediagnosticoSku,
} from './prediagnostico-sap-enrichment';

describe('prediagnostico SAP enrichment', () => {
  it('resuelve SKU desde validación SAP por OS', () => {
    const sku = resolvePrediagnosticoSku({
      unitMaterial: null,
      siblings: [],
      serviceOrderId: 'os-1',
      serial: 'ABC',
      sapMaterialByOs: new Map([['os-1', '4015902']]),
      sapMaterialBySerial: new Map(),
    });
    expect(sku).toBe('4015902');
  });

  it('prioriza documento SAP del traslado de serie', () => {
    expect(
      resolveNumeroTrasladoSap({
        unitSapTransfer: { sap_document_number: '4900111' },
        osSapTransfer: { sap_document_number: '4900222' },
        receptionSapDocument: '4900333',
      })
    ).toBe('4900111');
  });
});
