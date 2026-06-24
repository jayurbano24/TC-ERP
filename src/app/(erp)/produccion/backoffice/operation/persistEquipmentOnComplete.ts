'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { createServiceOrders } from '@/lib/database/receptions';
import { createOrGetSapTransfer, classifyEquipmentBatch } from '@/lib/database/sapTransfers';
import { generateClientCorrelationId } from '@/shared/infrastructure/http/correlationId.client';
import { countReadyEquipmentUnits } from '../historyTrayUtils';
import type { GuideItem, SapTransferGroup } from '../types';

export type PersistEquipmentParams = {
  activeReceptionId: string;
  scannedGuides: string[];
  guideItems: GuideItem[];
  sapGroups: SapTransferGroup[];
  sapTransferNumber: string;
  agencyLabel: string;
  currentUserFullName: string;
  /** Si no se pasa, se genera uno por operación de finalización. */
  correlationId?: string;
};

export type PersistEquipmentResult = {
  aborted: boolean;
  osCreatedCount: number;
  equipmentPersistError: string | null;
  expectedUnits: number;
  correlationId: string;
};

export async function persistEquipmentOnComplete(params: PersistEquipmentParams): Promise<PersistEquipmentResult> {
  const {
    activeReceptionId,
    scannedGuides,
    guideItems,
    sapGroups,
    sapTransferNumber,
    agencyLabel,
    currentUserFullName,
  } = params;

  const correlationId = params.correlationId ?? generateClientCorrelationId();

  let osCreatedCount = 0;
  let equipmentPersistError: string | null = null;

  const expectedUnits = countReadyEquipmentUnits(guideItems);
  const requiredUnits = guideItems.reduce((sum, item) => sum + item.cantidad, 0);

  if (requiredUnits > 0 && expectedUnits < requiredUnits) {
    alert(
      `Complete el pistoleo de series: ${expectedUnits}/${requiredUnits} unidades listas.
` +
        `Cada unidad debe tener todas sus series antes de finalizar.`
    );
    return { aborted: true, osCreatedCount: 0, equipmentPersistError: null, expectedUnits, correlationId };
  }

  const sapGroupsInManifest = Array.from(
    new Map(
      guideItems
        .map((item) => {
          const g = sapGroups.find((sg) => sg.id === item.sapGroupId);
          return g && g.sapDocument.trim() ? [g.id, g] as const : null;
        })
        .filter(Boolean) as [string, SapTransferGroup][]
    ).values()
  );

  const groupsToProcess =
    sapGroupsInManifest.length > 0
      ? sapGroupsInManifest
      : sapTransferNumber.trim()
        ? [{ id: 'legacy', sapDocument: sapTransferNumber.trim() }]
        : [];

  if (groupsToProcess.length === 0) {
    alert('Debe registrar al menos un Documento SAP con equipos antes de finalizar.');
    return { aborted: true, osCreatedCount: 0, equipmentPersistError: null, expectedUnits, correlationId };
  }

  const supabaseClient = getSupabaseBrowserClient();
  let updatedGuideId: string | undefined;
  if (supabaseClient) {
    const primaryGuideNumber = scannedGuides[0]?.trim();
    if (primaryGuideNumber) {
      const { data: guideRow } = await supabaseClient
        .from('reception_guides')
        .select('id')
        .eq('reception_id', activeReceptionId)
        .eq('guide_number', primaryGuideNumber)
        .maybeSingle();
      updatedGuideId = guideRow?.id;
    }
  }

  if (!updatedGuideId) {
    equipmentPersistError = 'No se encontró reception_guide para esta guía.';
    console.warn('[OS] Sin reception_guide_id');
  }

  const supabaseForUser = getSupabaseBrowserClient();
  const { data: userData } = supabaseForUser ? await supabaseForUser.auth.getUser() : { data: null };
  const registeredBy = userData?.user?.email || currentUserFullName;

  for (const sapGroup of groupsToProcess) {
    const groupItems = guideItems.filter((i) =>
      sapGroupsInManifest.length > 0 ? i.sapGroupId === sapGroup.id : true
    );

    const unitsForOS = groupItems.flatMap((item) =>
      item.series
        .filter(
          (unitSerials) =>
            Array.isArray(unitSerials) &&
            unitSerials.length >= item.seriesPerUnit &&
            String(unitSerials[0] || '').trim()
        )
        .map((unitSerials) => ({
          main_serial: String(unitSerials[0]).trim().toUpperCase(),
          model_id: item.modelo,
          brand_id: item.marca,
          all_series: unitSerials.map((sn) => String(sn).trim().toUpperCase()),
          material: item.sapMaterialNumber?.trim() || undefined,
        }))
    );

    if (unitsForOS.length === 0) continue;

    if (updatedGuideId) {
      const sapRes = await createOrGetSapTransfer({
        receptionId: activeReceptionId,
        receptionGuideId: updatedGuideId,
        sapDocumentNumber: sapGroup.sapDocument,
        agency: agencyLabel,
        registeredBy,
      });

      if (sapRes.error) {
        equipmentPersistError = sapRes.error;
        alert(`❌ Error Documento SAP ${sapGroup.sapDocument}: ${sapRes.error}`);
        continue;
      }

      const batchRes = await classifyEquipmentBatch({
        receptionId: activeReceptionId,
        sapTransferId: sapRes.data!.id,
        units: unitsForOS,
        registeredBy,
        correlationId,
      });

      if (batchRes.error) {
        equipmentPersistError = batchRes.error;
        alert(`❌ Error al clasificar equipos (SAP ${sapGroup.sapDocument}): ${batchRes.error}`);
      } else if (batchRes.data) {
        osCreatedCount += batchRes.data.length;
      }
    } else {
      const legacyRes = await createServiceOrders(activeReceptionId, unitsForOS, updatedGuideId);
      if (legacyRes.error) {
        equipmentPersistError = legacyRes.error;
      } else if (legacyRes.data) {
        osCreatedCount += legacyRes.data.length;
      }
    }
  }

  return { aborted: false, osCreatedCount, equipmentPersistError, expectedUnits, correlationId };
}
