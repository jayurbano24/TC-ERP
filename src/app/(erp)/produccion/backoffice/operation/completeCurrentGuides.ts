'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { normalizeGuideKey } from './classificationGuideUtils';
import { createServiceOrders, updateReception } from '@/lib/database/receptions';
import { createOrGetSapTransfer, classifyEquipmentBatch } from '@/lib/database/sapTransfers';
import { countReadyEquipmentUnits } from '../historyTrayUtils';
import { sanitizeCacAgencyRaw } from '@/lib/cacAgencyUtils';
import { auditGuideCompleted, auditReceptionClassified } from '@/lib/database/cacBackofficeAudit';
import { generateMovId } from '../backofficeHelpers';
import type { BackofficeReception, GuideItem, ReceptionStep, SapTransferGroup } from '../types';
import type { CatalogAgency, CatalogBrand, CatalogModel, CatalogTech } from '../types';
import type { BackofficeTab } from '../types';
import type React from 'react';

export type CompleteGuidesContext = {
  isSubmitting: boolean;
  isSubmittingRef: React.MutableRefObject<boolean>;
  setIsSubmitting: React.Dispatch<React.SetStateAction<boolean>>;
  scannedGuides: string[];
  processedGuides: string[];
  setProcessedGuides: React.Dispatch<React.SetStateAction<string[]>>;
  activeReception: BackofficeReception | null;
  category: 'Equipo' | 'Accesorio' | 'Teléfono';
  receptionStep: ReceptionStep;
  guideItems: GuideItem[];
  sapGroups: SapTransferGroup[];
  sapTransferNumber: string;
  selectedAgencyId: string;
  returnReason: string;
  returnTracking: string;
  returnCourier: string;
  accessoryPhotos: string[];
  CAC_AGENCIES: CatalogAgency[];
  MASTER_TECNOLOGIAS: CatalogTech[];
  MASTER_MARCAS: CatalogBrand[];
  MASTER_MODELOS: CatalogModel[];
  currentUserFullName: string;
  setReceptionStep: React.Dispatch<React.SetStateAction<ReceptionStep>>;
  setActiveTab: React.Dispatch<React.SetStateAction<BackofficeTab>>;
  setHistorySearch: React.Dispatch<React.SetStateAction<string>>;
  setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
  fetchHistory: (opts?: { silent?: boolean }) => Promise<void>;
};

export async function runCompleteCurrentGuides(ctx: CompleteGuidesContext) {

  if (ctx.isSubmitting || ctx.isSubmittingRef.current) return;
  ctx.isSubmittingRef.current = true;
  
  // Prevent double processing if already in ctx.processedGuides
  if (ctx.scannedGuides.length > 0 && ctx.scannedGuides.every(g => ctx.processedGuides.includes(g))) {
    ctx.setReceptionStep('completed');
    ctx.isSubmittingRef.current = false;
    return;
  }

  ctx.setIsSubmitting(true);
  try {
  const newProcessed = Array.from(new Set([
    ...(ctx.activeReception?.processed_guides || []), 
    ...ctx.scannedGuides
  ].map(g => g.trim())));
  if (ctx.activeReception?.id) {
    // Se guarda el progreso en las notas para evitar errores de columna inexistente
    const progressNotes = `\nGuías Procesadas: ${newProcessed.join(', ')}`;
    await updateReception(ctx.activeReception.id, { 
      notes: (ctx.activeReception.notes || '') + progressNotes
    });
    ctx.setProcessedGuides(newProcessed);

    const isEquipment = ctx.category === 'Equipo';
    const hasItems = ctx.guideItems.length > 0;

    if (hasItems || !isEquipment) {
      const firstItem = hasItems ? ctx.guideItems[0] : null;
      const agencyObj = ctx.CAC_AGENCIES.find(a => a.id === ctx.selectedAgencyId);
      const techNameVal = firstItem ? (ctx.MASTER_TECNOLOGIAS.find(t => t.id === firstItem.tipo)?.nombre || '') : '';
      const brandNameVal = firstItem ? (ctx.MASTER_MARCAS.find(b => b.id === firstItem.marca)?.nombre || '') : '';
      const modelNameVal = firstItem ? (ctx.MASTER_MODELOS.find(m => m.id === firstItem.modelo)?.nombre || '') : '';
      
      const currentGuide = ctx.scannedGuides[0]?.trim().toUpperCase();
      const mainGuide = ctx.activeReception.guide_number?.trim().toUpperCase();

      // Extraer las guías reales de las notas (fuente de verdad)
      // El campo guide_number es un ID técnico, no el número de guía real
      const rawGuideNumber = ctx.activeReception.guide_number || '';
      const fallbackGuides = rawGuideNumber.split(/[\\/,]/).map((g: string) => g.trim().toUpperCase()).filter(Boolean);
      const cleanNotesForGuias = (ctx.activeReception.notes || '')
        .split('--- LÍNEA DE TIEMPO')[0]
        .split('Backoffice_')[0]
        .split('Guías Procesadas:')[0];
      const guiasListString = cleanNotesForGuias?.split('Guías: ')[1]?.split('\n')[0];
      const receptionGuias = guiasListString 
        ? guiasListString.split(/[\\/,]/).map((g: string) => g.trim().toUpperCase()).filter(Boolean) 
        : fallbackGuides;

      // DETERMINACIÓN FALL-SAFE DE CATEGORÍA BASADA EN EL PASO ACTUAL
      let finalCategory = ctx.category || 'Equipo';
      if ((ctx.receptionStep as string) === 'accessories_photos') finalCategory = 'Accesorio';

      const agencyLabel = sanitizeCacAgencyRaw(
        agencyObj?.name || ctx.selectedAgencyId,
        ctx.activeReception?.carrier,
        ctx.CAC_AGENCIES
      );
      if (!agencyLabel && isEquipment) {
        alert('Debe seleccionar la Agencia CAC de ingreso (no es el mismo dato que el Courier).');
        ctx.setIsSubmitting(false);
        ctx.isSubmittingRef.current = false;
        return;
      }

      // Dynamic metadata defaults for Accessories and Phones
      const defaultTech = finalCategory.toLowerCase() === 'accesorio' ? 'ACCESORIOS' : (finalCategory.toLowerCase() === 'teléfono' ? 'MÓVILES' : '');
      const defaultBrand = finalCategory.toLowerCase() === 'accesorio' ? 'ACCESORIOS BODEGA' : (finalCategory.toLowerCase() === 'teléfono' ? 'MÓVILES BODEGA' : '');
      const defaultModel = finalCategory.toLowerCase() === 'accesorio' ? 'LOTE ACCESORIOS' : (finalCategory.toLowerCase() === 'teléfono' ? 'LOTE TELÉFONOS' : '');

      const techVal = techNameVal || defaultTech;
      const brandVal = brandNameVal || defaultBrand;
      const modelVal = modelNameVal || defaultModel;

      let targetReceptionId = ctx.activeReception.id;

      // 2. SIEMPRE ACTUALIZAR LA RECEPCIÓN MAESTRA (ej. REC-002) PARA REFLEJAR EL PROGRESO
      const timestamp = new Date().toLocaleString();
      const movId = generateMovId();
      const actionCode = finalCategory === 'Accesorio' ? 'BOD-ACC' : (finalCategory === 'Teléfono' ? 'BOD-MOV' : 'BOD-EQP');
      
      let cleanNotes = ctx.activeReception.notes || '';
      let baseNotes = cleanNotes;
      let detailsNotes = '';
      let timelineNotes = '';

      if (cleanNotes.includes('--- DETALLES BACKOFFICE ---') && cleanNotes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')) {
        baseNotes = cleanNotes.split('--- DETALLES BACKOFFICE ---')[0].trim();
        detailsNotes = cleanNotes.split('--- DETALLES BACKOFFICE ---')[1].split('--- LÍNEA DE TIEMPO (MATRIZ) ---')[0].trim();
        timelineNotes = cleanNotes.split('--- LÍNEA DE TIEMPO (MATRIZ) ---').pop()?.replace(/Status:.*$/m, '').replace(/Photos:.*$/m, '').trim() ?? '';
      } else if (cleanNotes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')) {
        baseNotes = cleanNotes.split('--- LÍNEA DE TIEMPO (MATRIZ) ---')[0].trim();
        timelineNotes = cleanNotes.split('--- LÍNEA DE TIEMPO (MATRIZ) ---').pop()?.replace(/Status:.*$/m, '').replace(/Photos:.*$/m, '').trim() ?? '';
      }

      if (baseNotes.includes('Guías Procesadas:')) {
        baseNotes = baseNotes.replace(/Guías Procesadas:.*$/m, `Guías Procesadas: ${newProcessed.join(', ')}`);
      } else {
        baseNotes += `\nGuías Procesadas: ${newProcessed.join(', ')}`;
      }

      const pendingTimelineEvent = `\n[${timestamp}] ${movId} | ${actionCode} | CLASIFICACIÓN (Guía ${ctx.scannedGuides.join(',')}): Movido a BODEGA: ${finalCategory.toUpperCase()} - Por: ${ctx.currentUserFullName}`;
      
      if (!timelineNotes) {
          timelineNotes = `[${new Date(ctx.activeReception.created_at).toLocaleString()}] MOV-START | REC-01 | RECEPCIÓN: Ingreso inicial al sistema en CAC.`;
      }

      const sapGroupsInManifest = Array.from(
        new Map(
          ctx.guideItems
            .map((item) => {
              const g = ctx.sapGroups.find((sg) => sg.id === item.sapGroupId);
              return g && g.sapDocument.trim() ? [g.id, g] as const : null;
            })
            .filter(Boolean) as [string, SapTransferGroup][]
        ).values()
      );

      for (const sapGroup of sapGroupsInManifest) {
        detailsNotes += `\n\n[Guía ${ctx.scannedGuides.join(',')} | SAP ${sapGroup.sapDocument}]` +
          `\nBackoffice_Agency: ${agencyLabel}` +
          `\nBackoffice_Category: ${finalCategory.toLowerCase()}` +
          (techVal ? `\nBackoffice_Tech: ${techVal}` : '') +
          (brandVal ? `\nBackoffice_Brand: ${brandVal}` : '') +
          (modelVal ? `\nBackoffice_Model: ${modelVal}` : '') +
          `\nBackoffice_SAP: ${sapGroup.sapDocument}` +
          `\nMotivo Devolución: ${ctx.returnReason || 'N/A'}` +
          `\nGuía de Envío: ${ctx.returnTracking || 'N/A'} (Logística: ${ctx.returnCourier || 'N/A'})`;
      }

      if (sapGroupsInManifest.length === 0) {
        detailsNotes += `\n\n[Guía ${ctx.scannedGuides.join(',')}]` +
          `\nBackoffice_Agency: ${agencyLabel}` +
          `\nBackoffice_Category: ${finalCategory.toLowerCase()}` +
          (techVal ? `\nBackoffice_Tech: ${techVal}` : '') +
          (brandVal ? `\nBackoffice_Brand: ${brandVal}` : '') +
          (modelVal ? `\nBackoffice_Model: ${modelVal}` : '') +
          (ctx.sapTransferNumber ? `\nBackoffice_SAP: ${ctx.sapTransferNumber}` : '') +
          `\nMotivo Devolución: ${ctx.returnReason || 'N/A'}` +
          `\nGuía de Envío: ${ctx.returnTracking || 'N/A'} (Logística: ${ctx.returnCourier || 'N/A'})`;
      }

      const allProcessed =
        receptionGuias.length === 0 ||
        receptionGuias.every((g: string) =>
          newProcessed.some((p) => normalizeGuideKey(p) === normalizeGuideKey(g))
        );

      const allSapDocs = sapGroupsInManifest.map((g) => g.sapDocument).filter(Boolean);

      const supabaseClient = getSupabaseBrowserClient();
      let updatedGuideId: string | undefined = undefined;

      if (supabaseClient) {
        const primaryGuideNumber = ctx.scannedGuides[0]?.trim();
        if (primaryGuideNumber) {
          const { data: guideRow } = await supabaseClient
            .from('reception_guides')
            .select('id')
            .eq('reception_id', ctx.activeReception.id)
            .eq('guide_number', primaryGuideNumber)
            .maybeSingle();
          updatedGuideId = guideRow?.id;
        }
      }

      // ── Crear Documento SAP + OS ANTES de marcar la recepción como clasificada ──
      let osCreatedCount = 0;
      let equipmentPersistError: string | null = null;

      const expectedUnits =
        isEquipment && hasItems
          ? countReadyEquipmentUnits(ctx.guideItems)
          : 0;

      const requiredUnits =
        isEquipment && hasItems
          ? ctx.guideItems.reduce((sum, item) => sum + item.cantidad, 0)
          : 0;

      if (isEquipment && hasItems && requiredUnits > 0 && expectedUnits < requiredUnits) {
        alert(
          `Complete el pistoleo de series: ${expectedUnits}/${requiredUnits} unidades listas.\n` +
            `Cada unidad debe tener todas sus series antes de finalizar.`
        );
        ctx.setIsSubmitting(false);
        ctx.isSubmittingRef.current = false;
        return;
      }

      if (isEquipment && hasItems) {
        if (!updatedGuideId) {
          equipmentPersistError = 'No se encontró reception_guide para esta guía.';
          console.warn('[OS] Sin reception_guide_id');
        }

        const groupsToProcess = sapGroupsInManifest.length > 0
          ? sapGroupsInManifest
          : (ctx.sapTransferNumber.trim()
              ? [{ id: 'legacy', sapDocument: ctx.sapTransferNumber.trim() }]
              : []);

        if (groupsToProcess.length === 0) {
          alert('Debe registrar al menos un Documento SAP con equipos antes de finalizar.');
          ctx.setIsSubmitting(false);
          ctx.isSubmittingRef.current = false;
          return;
        }

        const supabaseForUser = getSupabaseBrowserClient();
        const { data: userData } = supabaseForUser
          ? await supabaseForUser.auth.getUser()
          : { data: null };
        const registeredBy = userData?.user?.email || ctx.currentUserFullName;

        for (const sapGroup of groupsToProcess) {
          const groupItems = ctx.guideItems.filter((i) =>
            sapGroupsInManifest.length > 0 ? i.sapGroupId === sapGroup.id : true
          );

          const allUnits = groupItems.flatMap((item) =>
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
          const unitsForOS = allUnits;

          if (unitsForOS.length === 0) continue;

          if (updatedGuideId) {
            const sapRes = await createOrGetSapTransfer({
              receptionId: targetReceptionId,
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
              receptionId: targetReceptionId,
              sapTransferId: sapRes.data!.id,
              units: unitsForOS,
              registeredBy,
            });

            if (batchRes.error) {
              equipmentPersistError = batchRes.error;
              alert(`❌ Error al clasificar equipos (SAP ${sapGroup.sapDocument}): ${batchRes.error}`);
            } else if (batchRes.data) {
              osCreatedCount += batchRes.data.length;
            }
          } else {
            const legacyRes = await createServiceOrders(targetReceptionId, unitsForOS, updatedGuideId);
            if (legacyRes.error) {
              equipmentPersistError = legacyRes.error;
            } else if (legacyRes.data) {
              osCreatedCount += legacyRes.data.length;
            }
          }
        }
      }

      if (isEquipment && hasItems && expectedUnits > 0 && osCreatedCount === 0) {
        alert(
          `❌ No se guardaron equipos en la base de datos.\n` +
            (equipmentPersistError ? `${equipmentPersistError}\n` : '') +
            `La guía NO quedó clasificada. Verifique permisos (RLS) e intente de nuevo.`
        );
        ctx.setIsSubmitting(false);
        ctx.isSubmittingRef.current = false;
        return;
      }

      if (isEquipment && hasItems && expectedUnits > 0 && osCreatedCount < expectedUnits) {
        alert(
          `❌ Ingreso incompleto: ${osCreatedCount}/${expectedUnits} equipo(s) guardados.\n` +
            (equipmentPersistError ? `${equipmentPersistError}\n` : '') +
            `La guía NO quedó clasificada. Corrija el error e intente de nuevo.`
        );
        ctx.setIsSubmitting(false);
        ctx.isSubmittingRef.current = false;
        return;
      }

      if (isEquipment && hasItems && osCreatedCount > 0) {
        alert(`✅ ${osCreatedCount} equipo(s) registrado(s). Aparecerán en Historial Global.`);
        ctx.setHistorySearch(ctx.scannedGuides[0] || ctx.activeReception.guide_number || '');
      }

      timelineNotes += pendingTimelineEvent;
      const finalNotes = baseNotes +
        `\n\n--- DETALLES BACKOFFICE ---\n` + detailsNotes.trim() +
        `\n\n--- LÍNEA DE TIEMPO (MATRIZ) ---\n` + timelineNotes.trim() +
        `\n\nStatus: ${allProcessed ? 'RECIBIDO_BACKOFFICE' : 'EN_PROCESO_BACKOFFICE'}` +
        `\nPhotos: ${ctx.accessoryPhotos.join(', ')}`;

      const cleanUpdate = {
        status: allProcessed ? 'CLASIFICADA' : 'PENDIENTE DE CLASIFICAR',
        processed_guides: newProcessed,
        notes: finalNotes,
        evidence_url: ctx.activeReception.evidence_url || ctx.accessoryPhotos[0] || '',
        ...(allSapDocs.length === 1 ? { sap_document: allSapDocs[0] } : {}),
      };

      const resUpdate = await updateReception(ctx.activeReception.id, cleanUpdate);
      
      if (resUpdate.error) {
        alert("❌ ERROR DE ACTUALIZACIÓN MAESTRA: " + resUpdate.error);
      }

      if (supabaseClient) {
        const { data: userData } = await supabaseClient.auth.getUser();
        const userEmail = userData?.user?.email || ctx.currentUserFullName;
        const dbCategory = finalCategory.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        const { error: guidesUpdateError } = await supabaseClient
          .from('reception_guides')
          .update({
            category: dbCategory,
            status: 'CLASIFICADO',
            agency: agencyLabel,
            classified_by: userEmail,
            classified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...(ctx.returnReason ? { motivo: ctx.returnReason } : {}),
          })
          .eq('reception_id', ctx.activeReception.id)
          .in('guide_number', ctx.scannedGuides);

        if (guidesUpdateError) {
          console.error("Warning: Falló la actualización en reception_guides:", guidesUpdateError.message);
        } else {
          for (const guideNumber of ctx.scannedGuides) {
            await auditGuideCompleted({
              receptionId: ctx.activeReception.id,
              guideNumber: guideNumber.trim().toUpperCase(),
              category: finalCategory,
              agency: agencyLabel,
              classifiedBy: userEmail,
              osCount: isEquipment ? osCreatedCount : undefined,
            });
          }

          if (allProcessed) {
            await auditReceptionClassified({
              receptionId: ctx.activeReception.id,
              guideNumbers: newProcessed,
              classifiedBy: userEmail,
            });
          }
        }
      }
    }
  }
  await ctx.fetchHistory();
  
  if (ctx.category === 'Accesorio') {
    ctx.setActiveTab('sub_accesorios');
  } else if (ctx.category === 'Teléfono') {
    ctx.setActiveTab('sub_telefonos');
  } else if (ctx.category === 'Equipo') {
    ctx.setActiveTab('history');
    ctx.setHistoryPage(1);
  }
  
  ctx.setReceptionStep('completed');
  } finally {
    ctx.setIsSubmitting(false);
    ctx.isSubmittingRef.current = false;
  }
};
