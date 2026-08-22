'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { fetchAuthzMe } from '@/components/authz';
import { notify } from '@/components/ui/messaging/messageStore';
import { updateReception } from '@/modules/recepcion/client/receptions';
import { sanitizeCacAgencyRaw } from '@/lib/cacAgencyUtils';
import { generateMovId } from '../backofficeHelpers';
import type { SapTransferGroup } from '../types';
import type { CompleteGuidesContext } from './completeGuidesContext';
import { humanizeClassifyEquipmentError } from '@/modules/sap-transfer/client/humanizeClassifyError';
import { persistEquipmentOnComplete } from './persistEquipmentOnComplete';
import { getSapDocumentGuideConflict, normalizeGuideKey } from './classificationGuideUtils';
import { canClassifyToAccesorios, canClassifyToTelefonos } from './canClassifyAccesorios';

export type { CompleteGuidesContext } from './completeGuidesContext';

export async function runCompleteCurrentGuides(ctx: CompleteGuidesContext) {
  if (ctx.isSubmitting || ctx.isSubmittingRef.current) return;
  ctx.isSubmittingRef.current = true;

  if (
    (ctx.receptionStep as string) !== 'return_confirmation' &&
    (ctx.receptionStep as string) !== 'bulk_classify_confirm' &&
    ctx.scannedGuides.length > 0 &&
    ctx.scannedGuides.every((g) =>
      ctx.processedGuides.some((p) => normalizeGuideKey(p) === normalizeGuideKey(g))
    )
  ) {
    ctx.setReceptionStep('completed');
    ctx.isSubmittingRef.current = false;
    return;
  }

  const isAccesorioAttempt =
    ctx.category === 'Accesorio' || (ctx.receptionStep as string) === 'accessories_photos';
  const isTelefonoAttempt = ctx.category === 'Teléfono';
  if (isAccesorioAttempt || isTelefonoAttempt) {
    const authz = await fetchAuthzMe();
    if (isAccesorioAttempt && !canClassifyToAccesorios({ roleLabel: authz.roleLabel, isAdmin: authz.isAdmin })) {
      notify.warning('Sin permiso', {
        description: 'Solo el perfil SUPERVISOR STB puede clasificar hacia Accesorios.',
      });
      ctx.setReceptionStep('classification');
      ctx.isSubmittingRef.current = false;
      return;
    }
    if (isTelefonoAttempt && !canClassifyToTelefonos({ roleLabel: authz.roleLabel, isAdmin: authz.isAdmin })) {
      notify.warning('Sin permiso', {
        description: 'Backoffice solo puede clasificar CARGA como Equipos o Devolución.',
      });
      ctx.setReceptionStep('classification');
      ctx.isSubmittingRef.current = false;
      return;
    }
  }

  const sapDocs = [
    ...new Set(
      ctx.sapGroups
        .map((g) => g.sapDocument.trim())
        .filter(Boolean)
        .concat(ctx.sapTransferNumber?.trim() ? [ctx.sapTransferNumber.trim()] : [])
    ),
  ];
  for (const sapDoc of sapDocs) {
    const conflict = getSapDocumentGuideConflict(
      sapDoc,
      ctx.activeReception,
      ctx.processedGuides,
      [],
      ctx.scannedGuides
    );
    if (conflict) {
      notify.error('Documento SAP inválido', { description: conflict });
      ctx.isSubmittingRef.current = false;
      return;
    }
  }

  ctx.setIsSubmitting(true);
  try {
    const newProcessed = Array.from(
      new Set(
        [...(ctx.activeReception?.processed_guides || []), ...ctx.scannedGuides].map((g) =>
          normalizeGuideKey(g)
        )
      )
    ).filter(Boolean);
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
        const agencyObj = ctx.CAC_AGENCIES.find(
          (a) => a.id === ctx.selectedAgencyId || a.name === ctx.agencia
        );
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
        // return_confirmation solo cuenta como devolución si la categoría es Devolución
        // (Accesorio no debe pasar por ese step; histórico lo contaminaba).
        const isDevolucion =
          (step === 'return_confirmation' &&
            (ctx.category === 'Devolución' ||
              finalCategory.toLowerCase() === 'devolución' ||
              finalCategory.toLowerCase() === 'devolucion')) ||
          (step === 'bulk_classify_confirm' && ctx.category === 'Devolución') ||
          finalCategory.toLowerCase() === 'devolución' ||
          finalCategory.toLowerCase() === 'devolucion';
        const categoryLabelForNotes = isDevolucion
          ? 'devolucion'
          : finalCategory
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '');

        const attemptedAgency = agencyObj?.name || ctx.agencia || ctx.selectedAgencyId || '';
        const agencyLabel = sanitizeCacAgencyRaw(
          attemptedAgency,
          ctx.activeReception?.carrier,
          ctx.CAC_AGENCIES
        );
        if (!agencyLabel && (isEquipment || isDevolucion)) {
          const triedCourier = attemptedAgency.trim() && !agencyLabel;
          notify.warning(triedCourier ? 'Courier no es Agencia CAC' : 'Falta la Agencia CAC', {
            description: triedCourier
              ? `"${attemptedAgency.trim()}" es transportista (p. ej. Cargo Express), no una agencia. Seleccione la Agencia CAC de ingreso.`
              : 'Debe seleccionar la Agencia CAC de ingreso (no es el mismo dato que el Courier).',
          });
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
          receptionGuias.length === 0 ||
          receptionGuias.every((g: string) =>
            newProcessed.some((p) => normalizeGuideKey(p) === normalizeGuideKey(g))
          );
        const allSapDocs = sapGroupsInManifest.map((g) => g.sapDocument).filter(Boolean);

        let osCreatedCount = 0;
        let equipmentPersistError: string | null = null;
        let expectedUnits = 0;

        // Grabar clasificador en reception_guides ANTES del classify/upsert bandeja.
        const supabaseClientEarly = getSupabaseBrowserClient();
        if (supabaseClientEarly && isEquipment && hasItems) {
          const dbCategoryEarly = isDevolucion ? 'devolucion' : categoryLabelForNotes;
          const { error: guidesEarlyError } = await supabaseClientEarly
            .from('reception_guides')
            .upsert(
              ctx.scannedGuides.map((guideNumber) => ({
                reception_id: ctx.activeReception!.id,
                guide_number: guideNumber.trim(),
                category: dbCategoryEarly,
                status: 'CLASIFICADO',
                agency: agencyLabel,
                classified_by: ctx.currentUserFullName,
                classified_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...(ctx.returnReason ? { motivo: ctx.returnReason } : {}),
              })),
              { onConflict: 'reception_id,guide_number' }
            );
          if (guidesEarlyError) {
            console.warn('No se pudo pre-registrar clasificador en guías:', guidesEarlyError.message);
          }
        }

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
            const human = humanizeClassifyEquipmentError(equipmentPersistError);
            notify.error(human.title, {
              description: `${human.description} La guía NO quedó clasificada.`,
              duration: 0,
            });
            ctx.setIsSubmitting(false);
            ctx.isSubmittingRef.current = false;
            return;
          }

          if (expectedUnits > 0 && osCreatedCount < expectedUnits) {
            const missing = expectedUnits - osCreatedCount;
            // Sin detalle del RPC: asumir duplicado (caso típico 3/4 tras migración 177).
            const raw =
              equipmentPersistError ||
              `Duplicado en el mismo lote: ${missing} equipo(s) con serie repetida en la caja o guía, o ya registrados en TC.`;
            const human = humanizeClassifyEquipmentError(raw);
            notify.error(human.title, {
              description: `${human.description} Guardados: ${osCreatedCount} de ${expectedUnits}. La guía NO quedó clasificada.`,
              duration: 0,
            });
            ctx.setIsSubmitting(false);
            ctx.isSubmittingRef.current = false;
            return;
          }

          if (osCreatedCount > 0) {
            notify.success(`${osCreatedCount} equipo(s) registrado(s). Aparecerán en Historial Global.`, {
              title: 'Clasificación completada',
            });
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
            ? allProcessed
              ? 'BODEGA_DEVOLUCION'
              : 'PENDIENTE DE CLASIFICAR'
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
          notify.error('Error de actualización maestra', { description: resUpdate.error, duration: 0 });
          ctx.setIsSubmitting(false);
          ctx.isSubmittingRef.current = false;
          return;
        }

        const supabaseClient = getSupabaseBrowserClient();
        if (supabaseClient) {
          const dbCategory = isDevolucion
            ? 'devolucion'
            : categoryLabelForNotes;

          const guidesPayload = ctx.scannedGuides.map((guideNumber) => ({
            reception_id: ctx.activeReception!.id,
            guide_number: guideNumber.trim(),
            category: dbCategory,
            status: 'CLASIFICADO',
            agency: agencyLabel,
            classified_by: ctx.currentUserFullName,
            classified_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...(ctx.returnReason ? { motivo: ctx.returnReason } : {}),
          }));

          const { error: guidesUpsertError } = await supabaseClient
            .from('reception_guides')
            .upsert(guidesPayload, { onConflict: 'reception_id,guide_number' });

          if (guidesUpsertError) {
            console.error('Error upsert reception_guides:', guidesUpsertError.message);
            notify.error('No se pudo registrar la caja en Bodega Devolución', {
              description: `${guidesUpsertError.message}. Verifique permisos (RLS) e intente de nuevo.`,
              duration: 0,
            });
            ctx.setIsSubmitting(false);
            ctx.isSubmittingRef.current = false;
            return;
          }

          // Asegura nombre del clasificador en bandeja (no el de recepción).
          if (isEquipment && hasItems) {
            const { error: trayClassifierError } = await supabaseClient.rpc(
              'refresh_cac_tray_classifier',
              {
                p_reception_id: ctx.activeReception.id,
                p_guide_numbers: ctx.scannedGuides.map((g) => g.trim()),
                p_classifier_name: ctx.currentUserFullName,
              }
            );
            if (trayClassifierError) {
              console.warn('No se pudo refrescar clasificador en bandeja:', trayClassifierError.message);
            }
          }
        }
      }
    }
    ctx.setHistoryPage(1);
    await ctx.fetchHistory({ page: 1, silent: true });
    const step = ctx.receptionStep as string;
    const isBulkStep = step === 'bulk_classify_confirm';
    const isSubBodegaCategory = ctx.category === 'Accesorio' || ctx.category === 'Teléfono';
    if (
      step === 'return_confirmation' ||
      (isBulkStep && ctx.category === 'Devolución') ||
      isSubBodegaCategory ||
      step === 'sub_bodega_transfer'
    ) {
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
        notify.success('Caja(s) enviada(s) a Bodega Devolución', { description: 'Disponibles en Logística → Devoluciones.' });
      } else if (ctx.category === 'Accesorio') {
        const n = ctx.scannedGuides.length;
        notify.success('Caja(s) enviada(s) a Bodega Accesorios', {
          description: `${n} caja${n !== 1 ? 's' : ''} disponible${n !== 1 ? 's' : ''} en la pestaña BODEGA ACCESORIOS.`,
        });
      } else if (ctx.category === 'Teléfono') {
        const n = ctx.scannedGuides.length;
        notify.success('Caja(s) enviada(s) a Bodega Teléfonos', {
          description: `${n} caja${n !== 1 ? 's' : ''} disponible${n !== 1 ? 's' : ''} en la pestaña BODEGA TELÉFONOS.`,
        });
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
        notify.success('Caja enviada a Bodega Devolución', { description: 'Disponible en Logística → Devoluciones.' });
      } else if (ctx.category === 'Accesorio') {
        notify.success('Caja enviada a Bodega Accesorios', { description: 'Disponible en la pestaña BODEGA ACCESORIOS.' });
      } else if (ctx.category === 'Teléfono') {
        notify.success('Caja enviada a Bodega Teléfonos', { description: 'Disponible en la pestaña BODEGA TELÉFONOS.' });
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
