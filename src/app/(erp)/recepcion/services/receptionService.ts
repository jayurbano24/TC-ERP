import { receptionRepository } from '../repositories/receptionRepository';
import { DbReception } from '../types/reception.types';

export const receptionService = {
  getHistory: async (source: 'cac' | 'px') => {
    try {
      const data = await receptionRepository.getHistory(source);
      return data.map((r: any) => ({
        ...r,
        fecha_formateada: new Date(r.created_at).toLocaleString(),
        usuario: r.received_by || 'SISTEMA',
        pilot_display: r.notes?.split('Piloto: ')[1]?.split('\\n')[0] || '---'
      }));
    } catch (error) {
      console.error("Error fetching history:", error);
      throw error;
    }
  },

  finalizePXReception: async (guideData: any, manifestItems: any[], scannedSeries: any[], systemBrands: any[], systemModels: any[], currentUserFullName: string) => {
    const dbEntry: DbReception = {
      source: 'px',
      guide_number: guideData.guia || `PX-${Date.now().toString().slice(-6)}`,
      sap_document: guideData.sap || 'SIN-PEDIDO',
      carrier: guideData.proveedorPx || 'N/A',
      status: 'CLASIFICADA',
      notes: `DOC Ref: ${guideData.docReferencia || '---'}\\nAgencia: ${guideData.proveedorPx}\\nProveedor PX: ${guideData.proveedorPx}\\nPiloto: ${guideData.piloto || '---'}\\nCourier: ${guideData.courier || '---'}\\nBackoffice_Tech: ${manifestItems[0]?.tecnologia || ''}\\nCajas: ${manifestItems.length}`,
      received_units: scannedSeries.length,
      expected_units: manifestItems.reduce((acc, curr) => acc + curr.totalEsperado, 0),
      received_by: currentUserFullName
    };

    const boxes = manifestItems.map(item => ({
      id: item.id,
      box_code: item.boxCode,
      expected_units: item.totalEsperado,
      brand_id: systemBrands.find(b => b.name === item.marca)?.id || null,
      model_id: systemModels.find(m => m.name === item.modelo)?.id || null,
      material: item.material || null
    }));

    const seriesByBox: Record<string, any[]> = {};
    for (const s of scannedSeries) {
      const box = manifestItems.find(i => i.boxCode === s.boxCode);
      if (box) {
        if (!seriesByBox[box.id]) seriesByBox[box.id] = [];
        seriesByBox[box.id].push(s);
      }
    }

    return await receptionRepository.createPXReception(dbEntry, boxes, seriesByBox);
  }
};
