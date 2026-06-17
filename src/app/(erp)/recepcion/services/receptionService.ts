import { receptionRepository } from '../repositories/receptionRepository';

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

  finalizeCACReception: async (cacState: any, currentUserFullName: string) => {
    const reception = {
      source: 'cac',
      guide_number: cacState.cacScannedItems[0] || 'DESCONOCIDO',
      carrier: cacState.cacCarrier,
      status: 'RECEPCIONADA',
      notes: `Piloto: ${cacState.cacPilot}\nAgencia: ${cacState.cacAgency || 'N/A'}\nRecibido Por: ${currentUserFullName}`,
      received_units: cacState.cacScannedItems.length,
      expected_units: cacState.cacTotalCajas,
      received_by: null
    };
    return await receptionRepository.createCACReception(reception, cacState.cacScannedItems);
  },

  finalizePXReception: async (guideData: any, manifestItems: any[], scannedSeries: any[], systemBrands: any[], systemModels: any[], currentUserFullName: string) => {

    const nextGuideNumber = await receptionRepository.generateNextRECNumber();

    const uniqueBoxesMap = new Map<string, any>();
    for (const item of manifestItems) {
      if (!uniqueBoxesMap.has(item.boxCode)) {
        uniqueBoxesMap.set(item.boxCode, {
          id: item.boxCode, // Use boxCode as the identifier
          box_code: item.boxCode,
          expected_units: 0,
          brand_id: systemBrands.find(b => b.name === item.marca)?.id || null,
          model_id: systemModels.find(m => m.name === item.modelo)?.id || null,
          material: item.material || null
        });
      }
      uniqueBoxesMap.get(item.boxCode).expected_units += item.totalEsperado;
    }
    const boxes = Array.from(uniqueBoxesMap.values());

    const dbEntry: any = {
      source: 'px',
      guide_number: guideData.guia || nextGuideNumber,
      sap_document: guideData.sap || 'SIN-PEDIDO',
      carrier: guideData.proveedorPx || 'N/A',
      status: 'CLASIFICADA',
      notes: `DOC Ref: ${guideData.docReferencia || '---'}\nAgencia: ${guideData.proveedorPx}\nProveedor PX: ${guideData.proveedorPx}\nPiloto: ${guideData.piloto || '---'}\nCourier: ${guideData.courier || '---'}\nBackoffice_Tech: ${manifestItems[0]?.tecnologia || ''}\nCajas: ${boxes.length}\nRecibido Por: ${currentUserFullName}`,
      received_units: scannedSeries.length,
      expected_units: manifestItems.reduce((acc, curr) => acc + curr.totalEsperado, 0),
      received_by: null
    };

    const seriesByBox: Record<string, any[]> = {};
    for (const s of scannedSeries) {
      if (!seriesByBox[s.boxCode]) seriesByBox[s.boxCode] = [];
      seriesByBox[s.boxCode].push(s);
    }

    return await receptionRepository.createPXReception(dbEntry, boxes, seriesByBox);
  }
};
