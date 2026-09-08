import { notify, confirmDialog, promptDialog } from '@/components/ui';
import { getPxBoxesDefault } from '@/shared/constants/batchLimits';
import { validatePxIncrementalFinalizeReadiness } from '@/app/(erp)/recepcion/utils/pxBoxUtils';
import {
  finalizePxReceptionStepwise,
  joinOrStartPxReceptionApi,
  updatePxReceptionHeaderApi,
} from '@/app/(erp)/recepcion/services/pxIncrementalApi';
import type { PxReceptionCommandContext } from './pxCommandTypes';

const LEGACY_STORAGE_KEY = 'tc_erp_px_reception_state';

export async function executeStartReception(ctx: PxReceptionCommandContext): Promise<boolean> {
  const result = await joinOrStartPxReceptionApi({
    guideData: ctx.guideData,
    operatorName: ctx.operatorName,
    operatorId: ctx.operatorId,
    preferredGuideNumber: ctx.guideData.guia?.trim() || undefined,
  });
  ctx.setGuideData((prev) => ({ ...prev, guia: result.guideNumber }));
  ctx.setIsReceptionStarted(true);
  await ctx.session.start(result.receptionId);
  await ctx.loadInProgressList();
  return true;
}

export async function executeResumeReception(
  ctx: Pick<PxReceptionCommandContext, 'session' | 'setIsReceptionStarted'>,
  receptionId: string
): Promise<void> {
  const ok = await ctx.session.switchReception(receptionId);
  if (!ok) throw new Error('Recepción no encontrada o no reanudable');
  ctx.setIsReceptionStarted(true);
}

export async function executeSaveHeader(ctx: PxReceptionCommandContext): Promise<boolean> {
  if (!ctx.receptionId) return false;
  try {
    const data = await updatePxReceptionHeaderApi({
      receptionId: ctx.receptionId,
      guideData: ctx.guideData,
      operatorName: ctx.operatorName,
      expectedVersion: ctx.receptionVersion,
    });
    ctx.session.ingestSnapshot(data, 'MUTATION_RECONCILIATION', false);
    return true;
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : 'No se pudo guardar cabecera');
    return false;
  }
}

export async function executeFinalizeReception(ctx: PxReceptionCommandContext): Promise<void> {
  if (!ctx.receptionId) {
    notify.warning('No hay recepción activa en servidor.');
    return;
  }

  const readiness = validatePxIncrementalFinalizeReadiness(
    ctx.boxMetaByCode,
    ctx.closedBoxes,
    ctx.scannedSeries
  );
  if (!readiness.ok) {
    notify.warning(readiness.reason);
    return;
  }

  const totalCaptured = readiness.totalCaptured;
  if (
    !(await confirmDialog({
      title: 'Finalizar recepción PX',
      message: `Se enviarán ${readiness.boxCodes.length} caja(s) con ${totalCaptured} equipos a Bodega Central. Los datos ya están en servidor; este paso los ingresa a inventario.`,
      confirmText: 'Finalizar',
    }))
  ) {
    return;
  }

  let varianceReason: string | undefined;
  const totalExpected = Object.values(ctx.boxMetaByCode).reduce(
    (acc, b) => acc + (b.declared_quantity ?? 0),
    0
  );
  if (totalCaptured < totalExpected) {
    varianceReason = (await promptDialog({
      title: 'Variación de cantidad',
      message: `Hay variación (${totalCaptured} capturados vs ${totalExpected} declarados). Indique el motivo:`,
      prompt: { required: true, multiline: true },
    }))?.trim();
    if (!varianceReason) return;
  }

  try {
    const result = await finalizePxReceptionStepwise(
      {
        receptionId: ctx.receptionId,
        expectedVersion: ctx.receptionVersion,
        varianceReason,
        operatorId: ctx.operatorId,
        operatorName: ctx.operatorName,
        prepTotal: readiness.boxCodes.length,
        promoteTotal: totalCaptured,
      },
      ctx.setFinalizeProgress
    );

    const batchDesc =
      result.batches && (result.batches.prep > 0 || result.batches.promote > 0)
        ? ` (${result.batches.prep} prep + ${result.batches.promote} lotes)`
        : '';

    notify.success(
      result.already_finalized ? 'Recepción ya estaba finalizada' : 'Recepción PX finalizada',
      { description: `Equipos en Bodega Central${batchDesc}.` }
    );

    ctx.session.clearSession();
    ctx.resetOperationalState();
    ctx.setGuideData({
      sap: '',
      docReferencia: '',
      agencia: 'Monte Verdes',
      proveedorPx: '',
      guia: '',
      piloto: '',
      courier: '',
      totalCajasEsperadas: getPxBoxesDefault(),
    });
    ctx.setIsReceptionStarted(false);

    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      /* ignore */
    }

    await ctx.loadInProgressList();
    if (ctx.onHistoryRefresh) await ctx.onHistoryRefresh();
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : 'Error al finalizar recepción');
  } finally {
    ctx.setFinalizeProgress(null);
  }
}
