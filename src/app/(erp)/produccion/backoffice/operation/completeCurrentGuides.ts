'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { updateReception } from '@/lib/database/receptions';
import { sanitizeCacAgencyRaw } from '@/lib/cacAgencyUtils';
import { generateMovId } from '../backofficeHelpers';
import type { SapTransferGroup } from '../types';
import type { CompleteGuidesContext } from './completeGuidesContext';
import { persistEquipmentOnComplete } from './persistEquipmentOnComplete';

export type { CompleteGuidesContext } from './completeGuidesContext';

export async function runCompleteCurrentGuides(ctx: CompleteGuidesContext) {
  if (ctx.isSubmitting || ctx.isSubmittingRef.current) return;
  ctx.isSubmittingRef.current = true;

  if (
    (ctx.receptionStep as string) !== 'return_confirmation' &&
    (ctx.receptionStep as string) !== 'bulk_classify_confirm' &&
    ctx.scannedGuides.length > 0 &&
    ctx.scannedGuides.every((g) => ctx.processedGuides.includes(g))
  ) {
    ctx.setReceptionStep('completed');
    ctx.isSubmittingRef.current = false;
    return;
  }

  ctx.setIsSubmitting(true);
  try {
    const newProcessed = Array.from(
      new Set([...(ctx.activeReception?.processed_guides || []), ...ctx.scannedGuides].map((g) => g.trim()))
    );
    if (ctx.activeReception?.id) {
      const progressNotes = `\nGuías Procesadas: ${newProcessed.join(', ')}`;
      await updateReception(ctx.activeReception.id, {
        notes: (ctx.activeReception.notes || '') + progressNotes,
      });
      ctx.setProcessedGuides(newProcessed);

      const isEquipment = ctx.category === 'Equipo';
      const hasItems = ctx.guideItems.length > 0;

      if (hasItems || !isEquipment) {
        const firstItem = hasItems ? ctx.guideItems[0] : null;
        const agencyObj = ctx.CAC_AGENCIES.find((a) => a.id === ctx.selectedAgencyId);
        const techNameVal = firstItem
          ? ctx.MASTER_TECNOLOGIAS.find((t) => t.id === firstItem.tipo)?.nombre || ''
          : '';
        const brandNameVal = firstItem
          ? ctx.MASTER_MARCAS.find((b) => b.id === firstItem.marca)?.nombre || ''
          : '';
        const modelNameVal = firstItem
          ? ctx.MASTER_MODELOS.find((m) => m.id === firstItem.modelo)?.nombre || ''
          : '';

        const rawGuideNumber = ctx.activeReception.guide_number || '';
        const fallbackGuides = rawGuideNumber
          .split(/[\\/,]/)
          .map((g: string) => g.trim().toUpperCase())
          .filter(Boolean);
        const cleanNotesForGuias = (ctx.activeReception.notes || '')
          .split('--- LÍNEA DE TIEMPO')[0]
          .split('Backoffice_')[0]
          .split('Guías Procesadas:')[0];
        const guiasListString = cleanNotesForGuias?.split('Guías: ')[1]?.split('\n')[0];
        const receptionGuias = guiasListString
          ? guiasListString.split(/[\\/,]/).map((g: string) => g.trim().toUpperCase()).filter(Boolean)
          : fallbackGuides;

        let finalCategory = ctx.category || 'Equipo';
        if ((ctx.receptionStep as string) === 'accessories_photos') finalCategory = 'Accesorio';
        const step = ctx.receptionStep as string;
        const isDevolucion =
          step === 'return_confirmation' ||
          (step === 'bulk_classify_confirm' && ctx.category === 'Devolución') ||
          finalCategory.toLowerCase() === 'devolución' ||
          finalCategory.toLowerCase() === 'devolucion';
        const categoryLabelForNotes = isDevolucion
          ? 'devolucion'
          : finalCategory
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '');

        const agencyLabel = sanitizeCacAgencyRaw(
          agencyObj?.name || ctx.selectedAgencyId,
          ctx.activeReception?.carrier,
          ctx.CAC_AGENCIES
        );
        if (!agencyLabel && (isEquipment || isDevolucion)) {
          alert('Debe seleccionar la Agencia CAC de ingreso (no es el mismo dato que el Courier).');
          ctx.setIsSubmitting(false);
          ctx.isSubmittingRef.current = false;
          return;
        }

        const defaultTech =
          finalCategory.toLowerCase() === 'accesorio'
            ? 'ACCESORIOS'
            : finalCategory.toLowerCase() === 'teléfono'
              ? 'MÓVILES'
              : '';
        const defaultBrand =
          finalCategory.toLowerCase() === 'accesorio'
            ? 'ACCESORIOS BODEGA'
            : finalCategory.toLowerCase() === 'teléfono'
              ? 'MÓVILES BODEGA'
              : '';
        const defaultModel =
          finalCategory.toLowerCase() === 'accesorio'
            ? 'LOTE ACCESORIOS'
            : finalCategory.toLowerCase() === 'teléfono'
              ? 'LOTE TELÉFONOS'
              : '';

        const techVal = techNameVal || defaultTech;
        const brandVal = brandNameVal || defaultBrand;
        const modelVal = modelNameVal || defaultModel;

        const timestamp = new Date().toLocaleString();
        const movId = generateMovId();
        const actionCode = isDevolucion
          ? 'BOD-DEV'
          : finalCategory === 'Accesorio'
            ? 'BOD-ACC'
            : finalCategory === 'Teléfono'
              ? 'BOD-MOV'
              : 'BOD-EQP';

        let cleanNotes = ctx.activeReception.notes || '';
        let baseNotes = cleanNotes;
        let detailsNotes = '';
        let timelineNotes = '';

        if (
          cleanNotes.includes('--- DETALLES BACKOFFICE ---') &&
          cleanNotes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')
        ) {
          baseNotes = cleanNotes.split('--- DETALLES BACKOFFICE ---')[0].trim();
          detailsNotes = cleanNotes
            .split('--- DETALLES BACKOFFICE ---')[1]
            .split('--- LÍNEA DE TIEMPO (MATRIZ) ---')[0]
            .trim();
          timelineNotes =
            cleanNotes
              .split('--- LÍNEA DE TIEMPO (MATRIZ) ---')
              .pop()
              ?.replace(/Status:.*$/m, '')
              .replace(/Photos:.*$/m, '')
              .trim() ?? '';
        } else if (cleanNotes.includes('--- LÍNEA DE TIEMPO (MATRIZ) ---')) {
          baseNotes = cleanNotes.split('--- LÍNEA DE TIEMPO (MATRIZ) ---')[0].trim();
          timelineNotes =
            cleanNotes
              .split('--- LÍNEA DE TIEMPO (MATRIZ) ---')
              .pop()
              ?.replace(/Status:.*$/m, '')
              .replace(/Photos:.*$/m, '')
              .trim() ?? '';
        }

        if (baseNotes.includes('Guías Procesadas:')) {
          baseNotes = baseNotes.replace(
            /Guías Procesadas:.*$/m,
            `Guías Procesadas: ${newProcessed.join(', ')}`
          );
        } else {
          baseNotes += `\nGuías Procesadas: ${newProcessed.join(', ')}`;
        }

        const pendingTimelineEvent = `\n[${timestamp}] ${movId} | ${actionCode} | CLASIFICACIÓN (Guía ${ctx.scannedGuides.join(',')}): Movido a BODEGA: ${isDevolucion ? 'DEVOLUCIÓN' : finalCategory.toUpperCase()} - Por: ${ctx.currentUserFullName}`;

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
          detailsNotes +=
            `\n\n[Guía ${ctx.scannedGuides.join(',')} | SAP ${sapGroup.sapDocument}]` +
            `\nBackoffice_Agency: ${agencyLabel}` +
            `\nBackoffice_Category: ${categoryLabelForNotes}` +
            (techVal ? `\nBackoffice_Tech: ${techVal}` : '') +
            (brandVal ? `\nBackoffice_Brand: ${brandVal}` : '') +
            (modelVal ? `\nBackoffice_Model: ${modelVal}` : '') +
            `\nBackoffice_SAP: ${sapGroup.sapDocument}` +
            `\nMotivo Devolución: ${ctx.returnReason || 'N/A'}` +
            `\nGuía de Envío: ${ctx.returnTracking || 'N/A'} (Logística: ${ctx.returnCourier || 'N/A'})`;
        }

        if (sapGroupsInManifest.length === 0) {
          detailsNotes +=
            `\n\n[Guía ${ctx.scannedGuides.join(',')}]` +
            `\nBackoffice_Agency: ${agencyLabel}` +
            `\nBackoffice_Category: ${categoryLabelForNotes}` +
            (techVal ? `\nBackoffice_Tech: ${techVal}` : '') +
            (brandVal ? `\nBackoffice_Brand: ${brandVal}` : '') +
            (modelVal ? `\nBackoffice_Model: ${modelVal}` : '') +
            (ctx.sapTransferNumber ? `\nBackoffice_SAP: ${ctx.sapTransferNumber}` : '') +
            `\nMotivo Devolución: ${ctx.returnReason || 'N/A'}` +
            `\nGuía de Envío: ${ctx.returnTracking || 'N/A'} (Logística: ${ctx.returnCourier || 'N/A'})`;
        }

        const allProcessed =
          receptionGuias.length === 0 || receptionGuias.every((g: string) => newProcessed.includes(g));
        const allSapDocs = sapGroupsInManifest.map((g) => g.sapDocument).filter(Boolean);

        let osCreatedCount = 0;
        let equipmentPersistError: string | null = null;
        let expectedUnits = 0;

        if (isEquipment && hasItems) {
          const persistResult = await persistEquipmentOnComplete({
            activeReceptionId: ctx.activeReception.id,
            scannedGuides: ctx.scannedGuides,
            guideItems: ctx.guideItems,
            sapGroups: ctx.sapGroups,
            sapTransferNumber: ctx.sapTransferNumber,
            agencyLabel,
            currentUserFullName: ctx.currentUserFullName,
          });

          if (persistResult.aborted) {
            ctx.setIsSubmitting(false);
            ctx.isSubmittingRef.current = false;
            return;
          }

          osCreatedCount = persistResult.osCreatedCount;
          equipmentPersistError = persistResult.equipmentPersistError;
          expectedUnits = persistResult.expectedUnits;

          if (expectedUnits > 0 && osCreatedCount === 0) {
            alert(
              `❌ No se guardaron equipos en la base de datos.\n` +
                (equipmentPersistError ? `${equipmentPersistError}\n` : '') +
                `La guía NO quedó clasificada. Verifique permisos (RLS) e intente de nuevo.`
            );
            ctx.setIsSubmitting(false);
            ctx.isSubmittingRef.current = false;
            return;
          }

          if (expectedUnits > 0 && osCreatedCount < expectedUnits) {
            alert(
              `❌ Ingreso incompleto: ${osCreatedCount}/${expectedUnits} equipo(s) guardados.\n` +
                (equipmentPersistError ? `${equipmentPersistError}\n` : '') +
                `La guía NO quedó clasificada. Corrija el error e intente de nuevo.`
            );
            ctx.setIsSubmitting(false);
            ctx.isSubmittingRef.current = false;
            return;
          }

          if (osCreatedCount > 0) {
            alert(`✅ ${osCreatedCount} equipo(s) registrado(s). Aparecerán en Historial Global.`);
            ctx.setHistorySearch(ctx.scannedGuides[0] || ctx.activeReception.guide_number || '');
          }
        }

        timelineNotes += pendingTimelineEvent;
        const finalNotes =
          baseNotes +
          `\n\n--- DETALLES BACKOFFICE ---\n` +
          detailsNotes.trim() +
          `\n\n--- LÍNEA DE TIEMPO (MATRIZ) ---\n` +
          timelineNotes.trim() +
          `\n\nStatus: ${allProcessed ? 'RECIBIDO_BACKOFFICE' : 'EN_PROCESO_BACKOFFICE'}` +
          `\nPhotos: ${ctx.accessoryPhotos.join(', ')}`;

        const cleanUpdate = {
          status: isDevolucion
            ? 'BODEGA_DEVOLUCION'
            : allProcessed
              ? 'CLASIFICADA'
              : 'PENDIENTE DE CLASIFICAR',
          processed_guides: newProcessed,
          notes: finalNotes,
          evidence_url: ctx.activeReception.evidence_url || ctx.accessoryPhotos[0] || '',
          ...(allSapDocs.length === 1 ? { sap_document: allSapDocs[0] } : {}),
        };

        const resUpdate = await updateReception(ctx.activeReception.id, cleanUpdate);
        if (resUpdate.error) {
          alert('❌ ERROR DE ACTUALIZACIÓN MAESTRA: ' + resUpdate.error);
        }

        const supabaseClient = getSupabaseBrowserClient();
        if (supabaseClient) {
          const { data: userData } = await supabaseClient.auth.getUser();
          const userEmail = userData?.user?.email || ctx.currentUserFullName;
          const dbCategory = isDevolucion
            ? 'devolucion'
            : categoryLabelForNotes;

          const guidesPayload = ctx.scannedGuides.map((guideNumber) => ({
            reception_id: ctx.activeReception!.id,
            guide_number: guideNumber.trim(),
            category: dbCategory,
            status: 'CLASIFICADO',
            agency: agencyLabel,
            classified_by: userEmail,
            classified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...(ctx.returnReason ? { motivo: ctx.returnReason } : {}),
          }));

          const { error: guidesUpsertError } = await supabaseClient
            .from('reception_guides')
            .upsert(guidesPayload, { onConflict: 'reception_id,guide_number' });

          if (guidesUpsertError) {
            console.error('Error upsert reception_guides:', guidesUpsertError.message);
            alert(
              `❌ No se pudo registrar la caja en Bodega Devolución.\n${guidesUpsertError.message}\nVerifique permisos (RLS) e intente de nuevo.`
            );
            ctx.setIsSubmitting(false);
            ctx.isSubmittingRef.current = false;
            return;
          }
        }
      }
    }
    ctx.setHistoryPage(1);
    await ctx.fetchHistory({ page: 1, silent: true });
    const step = ctx.receptionStep as string;
    const isBulkStep = step === 'bulk_classify_confirm';
    if (step === 'return_confirmation' || (isBulkStep && ctx.category === 'Devolución')) {
      await ctx.fetchPending?.({ silent: true });
    }

    if (isBulkStep && ctx.activeReception) {
      const rawGuideNumber = ctx.activeReception.guide_number || '';
      const fallbackGuides = rawGuideNumber
        .split(/[\\/,]/)
        .map((g: string) => g.trim().toUpperCase())
        .filter(Boolean);
      const cleanNotesForGuias = (ctx.activeReception.notes || '')
        .split('--- LÍNEA DE TIEMPO')[0]
        .split('Backoffice_')[0]
        .split('Guías Procesadas:')[0];
      const guiasListString = cleanNotesForGuias?.split('Guías: ')[1]?.split('\n')[0];
      const receptionGuias = guiasListString
        ? guiasListString.split(/[\\/,]/).map((g: string) => g.trim().toUpperCase()).filter(Boolean)
        : fallbackGuides;
      const normalizedProcessed = newProcessed.map((g) => g.trim().toUpperCase());
      const allDone = receptionGuias.every((g) => normalizedProcessed.includes(g));
      if (ctx.category === 'Devolución') {
        alert('✅ Caja(s) enviada(s) a Bodega Devolución en Logística → Devoluciones.');
      }
      ctx.setReceptionStep(allDone ? 'completed' : 'classification');
      if (!allDone) {
        ctx.setScannedGuides?.([]);
        ctx.setReturnReason?.('');
        ctx.setReturnTracking?.('');
        ctx.setReturnCourier?.('');
        ctx.setSelectedAgencyId?.('');
      } else if (ctx.category === 'Accesorio') {
        ctx.setActiveTab('sub_accesorios');
      } else if (ctx.category === 'Teléfono') {
        ctx.setActiveTab('sub_telefonos');
      }
    } else {
      if (ctx.category === 'Accesorio') {
        ctx.setActiveTab('sub_accesorios');
      } else if (ctx.category === 'Teléfono') {
        ctx.setActiveTab('sub_telefonos');
      } else if (step === 'return_confirmation' || (isBulkStep && ctx.category === 'Devolución')) {
        alert('✅ Caja enviada a Bodega Devolución en Logística → Devoluciones.');
      } else if (ctx.category === 'Equipo') {
        ctx.setActiveTab('history');
        ctx.setHistoryPage(1);
      }
      ctx.setReceptionStep('completed');
    }
  } finally {
    ctx.setIsSubmitting(false);
    ctx.isSubmittingRef.current = false;
  }
}
