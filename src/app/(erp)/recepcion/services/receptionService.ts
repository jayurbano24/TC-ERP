import { receptionRepository } from '../repositories/receptionRepository';
import { getCurrentReceptionActor } from '@/modules/recepcion/client/receptionActor';
import { parseReceptionReceiverFromNotes } from '@/modules/recepcion/client/receptionNotes';

function resolveReceptionDisplayName(row: {
  received_by_profile?: { full_name?: string | null } | null;
  notes?: string | null;
  received_by?: string | null;
}): string {
  const fromProfile = row.received_by_profile?.full_name?.trim();
  if (fromProfile) return fromProfile;
  const fromNotes = parseReceptionReceiverFromNotes(row.notes || '');
  if (fromNotes && fromNotes !== '---') return fromNotes;
  if (row.received_by && !row.received_by.includes('-')) return row.received_by;
  return 'SISTEMA';
}

export const receptionService = {
  getHistory: async (source: 'cac' | 'px') => {
    try {
      const data = await receptionRepository.getHistory(source);
      return data.map((r: any) => ({
        ...r,
        fecha_formateada: new Date(r.created_at).toLocaleString(),
        usuario: resolveReceptionDisplayName(r),
        pilot_display: r.notes?.split('Piloto: ')[1]?.split('\\n')[0] || '---'
      }));
    } catch (error) {
      console.error("Error fetching history:", error);
      throw error;
    }
  },

  finalizeCACReception: async (cacState: any, currentUserFullName?: string) => {
    const actor = await getCurrentReceptionActor();
    const fullName = currentUserFullName?.trim() || actor.fullName;

    const reception = {
      source: 'cac',
      guide_number: cacState.cacScannedItems[0] || 'DESCONOCIDO',
      carrier: cacState.cacCarrier,
      status: 'RECEPCIONADA',
      notes: `Piloto: ${cacState.cacPilot}\nAgencia: ${cacState.cacAgency || 'N/A'}\nRecibido Por: ${fullName}\nGuías: ${cacState.cacScannedItems.join(', ')}`,
      processed_guides: [],
      received_units: cacState.cacScannedItems.length,
      expected_units: cacState.cacTotalCajas,
      received_by: actor.userId,
    };
    return await receptionRepository.createCACReception(reception, cacState.cacScannedItems);
  },

  finalizePXReception: async (guideData: any, manifestItems: any[], scannedSeries: any[], systemBrands: any[], systemModels: any[], currentUserFullName?: string) => {
    const actor = await getCurrentReceptionActor();
    const fullName = currentUserFullName?.trim() || actor.fullName;

    const headerCheck = await receptionRepository.validatePxHeaderUniqueness(
      guideData.sap || '',
      guideData.docReferencia || ''
    );
    if (!headerCheck.ok) {
      return { error: headerCheck.message };
    }

    const explicitGuide = guideData.guia?.trim();
    if (explicitGuide) {
      const available = await receptionRepository.isPxGuideNumberAvailable(explicitGuide);
      if (!available) {
        return {
          error: `El número de recepción ${explicitGuide} ya está registrado. Deje el campo REC vacío para autogenerar uno nuevo o use otro número.`,
        };
      }
    }

    const guideNumber = await receptionRepository.resolveUniquePxGuideNumber(explicitGuide || undefined);

    const seriesValidation = await receptionRepository.validatePxScannedSeriesForFinalize(scannedSeries);
    if (seriesValidation.error) {
      return { error: seriesValidation.error };
    }

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
      guide_number: guideNumber,
      sap_document: guideData.sap || 'SIN-PEDIDO',
      carrier: guideData.proveedorPx || 'N/A',
      status: 'CLASIFICADA',
      notes: `DOC Ref: ${guideData.docReferencia || '---'}\nAgencia: ${guideData.proveedorPx}\nProveedor PX: ${guideData.proveedorPx}\nPiloto: ${guideData.piloto || '---'}\nCourier: ${guideData.courier || '---'}\nBackoffice_Tech: ${manifestItems[0]?.tecnologia || ''}\nCajas: ${boxes.length}\nRecibido Por: ${fullName}`,
      received_units: scannedSeries.length,
      expected_units: manifestItems.reduce((acc, curr) => acc + curr.totalEsperado, 0),
      received_by: actor.userId,
    };

    const seriesByBox: Record<string, any[]> = {};
    for (const s of scannedSeries) {
      if (!seriesByBox[s.boxCode]) seriesByBox[s.boxCode] = [];
      seriesByBox[s.boxCode].push(s);
    }

    return await receptionRepository.createPXReception(dbEntry, boxes, seriesByBox);
  }
};
