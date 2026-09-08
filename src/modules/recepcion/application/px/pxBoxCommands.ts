import type { QueryClient } from '@tanstack/react-query';
import { notify, confirmDialog, promptDialog } from '@/components/ui';
import { getPxBoxesDefault } from '@/shared/constants/batchLimits';
import { canCreateNewPxBox } from '@/app/(erp)/recepcion/utils/pxBoxUtils';
import {
  acquireBoxLockApi,
  appendPxCaptureLotsApi,
  closePxBoxApi,
  createPxBoxApi,
  deletePxCaptureBoxApi,
  fetchPxBoxMeta,
  reopenPxBoxApi,
  releaseBoxLockApi,
  voidPxEquipmentApi,
} from '@/app/(erp)/recepcion/services/pxIncrementalApi';
import {
  patchPxCacheAfterAdjustBox,
  patchPxCacheAfterAppendLot,
  patchPxCacheAfterCloseBox,
  patchPxCacheAfterCreateBox,
  patchPxCacheAfterReopenBox,
} from '@/modules/recepcion/client/pxMutationCache';
import type { CurrentEntry } from '@/app/(erp)/recepcion/types/reception.types';
import type { PxBoxSnapshot } from '@/modules/recepcion/client/pxCapture';
import {
  buildLotInputFromEntry,
  isPxVersionConflict,
  type PxBoxCommandContext,
} from './pxCommandTypes';

type BoxRpcResult = {
  box_id: string;
  status?: string;
  version?: number;
  captured_count?: number;
  declared_quantity?: number;
};

export async function fetchFreshBoxVersion(
  queryClient: QueryClient,
  boxCode: string,
  boxId: string | undefined,
  mutators: PxBoxCommandContext['mutators'],
  boxMetaRef: PxBoxCommandContext['boxMetaRef'],
  boxVersionByCodeRef: PxBoxCommandContext['boxVersionByCodeRef']
): Promise<number> {
  if (!boxId) return boxVersionByCodeRef.current[boxCode] ?? 1;
  const meta = await fetchPxBoxMeta(boxId);
  mutators.setBoxVersionByCode((prev) => ({ ...prev, [boxCode]: meta.version }));
  mutators.setBoxMetaByCode((prev) => {
    const current = prev[boxCode];
    const next = {
      ...(current || {
        id: meta.id,
        box_code: meta.box_code,
        brand_id: null,
        model_id: null,
        lots: [],
        equipment: [],
        rejected_count: 0,
        rejections: [],
        declared_quantity: 0,
        captured_count: 0,
        version: 1,
        status: 'en_captura',
      }),
      id: meta.id,
      box_code: meta.box_code,
      status: meta.status,
      declared_quantity: meta.declared_quantity,
      captured_count: meta.captured_count,
      version: meta.version,
      locked_by: meta.locked_by,
      lock_expires_at: meta.lock_expires_at,
    } satisfies PxBoxSnapshot;
    boxMetaRef.current = { ...boxMetaRef.current, [boxCode]: next };
    return { ...prev, [boxCode]: next };
  });
  void queryClient;
  return meta.version;
}

export async function executeAcquireBoxLock(
  ctx: Pick<PxBoxCommandContext, 'operatorName' | 'ensureOperatorId' | 'mutators' | 'boxMetaRef'>,
  boxCode: string,
  boxId: string
): Promise<boolean> {
  try {
    const opId = await ctx.ensureOperatorId();
    if (!opId) {
      notify.warning('Sesión de usuario no lista. Espere un momento o recargue la página.');
      return false;
    }
    const result = await acquireBoxLockApi({
      boxId,
      operatorId: opId,
      operatorName: ctx.operatorName,
    });
    ctx.mutators.setBoxMetaByCode((prev) => {
      const current = prev[boxCode];
      if (!current) return prev;
      const next = {
        ...prev,
        [boxCode]: {
          ...current,
          locked_by: result.locked_by ?? opId,
          lock_expires_at: result.lock_expires_at ?? current.lock_expires_at,
          version: result.version ?? current.version,
        },
      };
      ctx.boxMetaRef.current = { ...ctx.boxMetaRef.current, [boxCode]: next[boxCode]! };
      return next;
    });
    if (result.version) {
      ctx.mutators.setBoxVersionByCode((prev) => ({ ...prev, [boxCode]: result.version! }));
    }
    return true;
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : 'No se pudo tomar control de la caja');
    return false;
  }
}

export async function executeAddLotToBox(
  ctx: PxBoxCommandContext,
  boxCode: string,
  currentEntry: CurrentEntry
): Promise<boolean> {
  if (!ctx.receptionId) {
    notify.warning('Inicie la recepción en servidor primero.');
    return false;
  }
  if (!currentEntry.tecnologia || !currentEntry.marca || !currentEntry.modelo || !currentEntry.totalEsperado) {
    notify.warning('Complete tecnología, marca, modelo y cantidad esperada.');
    return false;
  }

  const lot = buildLotInputFromEntry({
    entry: currentEntry,
    systemBrands: ctx.systemBrands,
    systemModels: ctx.systemModels,
  });
  const existingBoxId = ctx.boxIdByCode[boxCode];

  try {
    let boxId = existingBoxId;
    let effectiveBoxCode = boxCode;
    if (!boxId) {
      const limitCheck = canCreateNewPxBox(
        ctx.boxMetaRef.current,
        ctx.guideData.totalCajasEsperadas ?? getPxBoxesDefault()
      );
      if (!limitCheck.ok) {
        notify.warning(limitCheck.reason);
        return false;
      }
      const created = await createPxBoxApi(ctx.receptionId, boxCode, [lot]);
      boxId = created.id;
      effectiveBoxCode = created.box_code || boxCode;
      patchPxCacheAfterCreateBox(ctx.queryClient, ctx.receptionId, created, lot);
    } else {
      const appendResult = await appendPxCaptureLotsApi(existingBoxId, [lot]);
      patchPxCacheAfterAppendLot(
        ctx.queryClient,
        ctx.receptionId,
        existingBoxId,
        lot,
        appendResult.declaredQuantity
      );
    }
    ctx.setSelectedBoxForScan(effectiveBoxCode);
    return executeAcquireBoxLock(ctx, effectiveBoxCode, boxId);
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : 'Error al registrar lote en servidor');
    return false;
  }
}

async function runWithVersionRetry<T extends { box_id: string; version?: number }>(
  boxCode: string,
  ctx: PxBoxCommandContext,
  boxId: string,
  expectedVersion: number,
  action: (version: number) => Promise<T>
): Promise<T> {
  try {
    return await action(expectedVersion);
  } catch (err: unknown) {
    if (!isPxVersionConflict(err)) throw err;
    const fresh = await ctx.getFreshBoxVersion(boxCode);
    return action(fresh);
  }
}

export async function executeCloseBox(ctx: PxBoxCommandContext, boxCode: string): Promise<boolean> {
  const meta = ctx.boxMetaByCode[boxCode];
  const boxId = ctx.boxIdByCode[boxCode];
  if (!meta || !boxId) return false;

  const captured = meta.captured_count ?? 0;
  const declared = meta.declared_quantity ?? 0;
  let partialReason: string | undefined;

  if (captured < declared) {
    partialReason = (await promptDialog({
      title: 'Cierre parcial de caja',
      message: `Caja incompleta (${captured}/${declared}). Indique el motivo:`,
      prompt: { required: true, multiline: true },
    }))?.trim();
    if (!partialReason) return false;
  } else if (
    !(await confirmDialog({
      title: `Cerrar ${boxCode}`,
      message: `¿Cerrar ${boxCode}? (${captured}/${declared} equipos)`,
      confirmText: 'Cerrar caja',
    }))
  ) {
    return false;
  }

  try {
    const operatorId = await ctx.ensureOperatorId();
    const closeResult = await runWithVersionRetry<BoxRpcResult>(
      boxCode,
      ctx,
      boxId,
      ctx.boxVersionByCode[boxCode] ?? meta.version ?? 1,
      (expectedVersion) =>
        closePxBoxApi({
          boxId,
          expectedVersion,
          partialReason,
          operatorId,
          operatorName: ctx.operatorName,
        }) as Promise<BoxRpcResult>
    );
    try {
      await releaseBoxLockApi({ boxId, operatorId: ctx.operatorId, reason: 'box_closed' });
    } catch {
      /* lock may already be cleared by RPC */
    }
    if (ctx.receptionId) {
      patchPxCacheAfterCloseBox(ctx.queryClient, ctx.receptionId, closeResult);
    }
    ctx.mutators.setClosedBoxes((prev) => (prev.includes(boxCode) ? prev : [...prev, boxCode]));
    ctx.mutators.patchBoxMetaLocal(boxCode, {
      status: closeResult.status ?? 'cerrada',
      version: closeResult.version,
      captured_count: closeResult.captured_count,
      declared_quantity: closeResult.declared_quantity,
      locked_by: null,
      lock_expires_at: null,
    });
    return true;
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : 'No se pudo cerrar la caja');
    return false;
  }
}

export async function executeReopenBox(ctx: PxBoxCommandContext, boxCode: string): Promise<void> {
  const meta = ctx.boxMetaByCode[boxCode];
  const boxId = ctx.boxIdByCode[boxCode];
  if (!meta || !boxId) return;
  if (
    !(await confirmDialog({
      title: `Reabrir ${boxCode}`,
      message: `¿Reabrir ${boxCode}?`,
      confirmText: 'Reabrir',
    }))
  ) {
    return;
  }

  try {
    const operatorId = await ctx.ensureOperatorId();
    const reopenResult = await runWithVersionRetry<BoxRpcResult>(
      boxCode,
      ctx,
      boxId,
      ctx.boxVersionByCode[boxCode] ?? meta.version ?? 1,
      (expectedVersion) =>
        reopenPxBoxApi({
          boxId,
          expectedVersion,
          operatorId,
          operatorName: ctx.operatorName,
        }) as Promise<BoxRpcResult>
    );
    if (ctx.receptionId) {
      patchPxCacheAfterReopenBox(ctx.queryClient, ctx.receptionId, reopenResult);
    }
    ctx.mutators.setClosedBoxes((prev) => prev.filter((code) => code !== boxCode));
    ctx.mutators.patchBoxMetaLocal(boxCode, {
      status: reopenResult.status ?? 'en_captura',
      version: reopenResult.version,
    });
    await ctx.onAcquireBoxLock(boxCode, boxId);
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : 'No se pudo reabrir la caja');
  }
}

export async function executeAdjustBoxQuantity(
  ctx: PxBoxCommandContext,
  boxCode: string,
  newQty: number,
  reason: string
): Promise<void> {
  const boxId = ctx.boxIdByCode[boxCode];
  const meta = ctx.boxMetaByCode[boxCode];
  if (!boxId || !meta) return;

  const { adjustPxBoxQuantityApi } = await import('@/app/(erp)/recepcion/services/pxIncrementalApi');
  const operatorId = await ctx.ensureOperatorId();
  const adjustResult = await runWithVersionRetry<BoxRpcResult>(
    boxCode,
    ctx,
    boxId,
    ctx.boxVersionByCode[boxCode] ?? meta.version ?? 1,
    (expectedVersion) =>
      adjustPxBoxQuantityApi({
        boxId,
        newDeclaredQuantity: newQty,
        reason,
        expectedVersion,
        operatorId,
        operatorName: ctx.operatorName,
      }) as Promise<BoxRpcResult>
  );

  if (ctx.receptionId) {
    patchPxCacheAfterAdjustBox(ctx.queryClient, ctx.receptionId, adjustResult);
  }
  ctx.mutators.patchBoxMetaLocal(boxCode, {
    declared_quantity: adjustResult.declared_quantity,
    captured_count: adjustResult.captured_count,
    version: adjustResult.version,
  });
}

export async function executeDeleteEquipment(
  ctx: PxBoxCommandContext,
  boxCode: string,
  item: { equipmentId?: string; sn: string }
): Promise<boolean> {
  if (!ctx.receptionId) {
    notify.warning('Recepción no iniciada en servidor.');
    return false;
  }
  if (
    !(await confirmDialog({
      title: 'Eliminar equipo',
      message: `¿Eliminar el equipo con serie ${item.sn}?`,
      tone: 'error',
      confirmText: 'Eliminar',
    }))
  ) {
    return false;
  }

  const boxId = ctx.boxIdByCode[boxCode];
  if (!boxId) {
    notify.warning('Caja no registrada en servidor.');
    return false;
  }

  const opId = await ctx.ensureOperatorId();
  if (!opId) {
    notify.warning('Sesión de usuario no lista.');
    return false;
  }

  const meta = ctx.boxMetaRef.current[boxCode] ?? ctx.boxMetaByCode[boxCode];
  const lockHeldByMe =
    meta?.locked_by &&
    opId &&
    meta.locked_by === opId &&
    meta.lock_expires_at &&
    new Date(meta.lock_expires_at) > new Date();

  if (!lockHeldByMe) {
    const ok = await ctx.onAcquireBoxLock(boxCode, boxId);
    if (!ok) return false;
  }

  const prevSeries = ctx.scannedSeriesRef.current;
  const nextSeries = prevSeries.filter((s) => {
    if (item.equipmentId) return s.equipmentId !== item.equipmentId;
    return !(s.boxCode === boxCode && s.sn === item.sn);
  });
  ctx.scannedSeriesRef.current = nextSeries;
  ctx.mutators.setScannedSeries(nextSeries);

  try {
    const isPending = item.equipmentId?.startsWith('pending-');
    const result = await voidPxEquipmentApi({
      receptionId: ctx.receptionId,
      boxId,
      equipmentId: isPending ? null : item.equipmentId,
      mainSerial: item.sn,
      operatorId: opId,
      operatorName: ctx.operatorName,
    });
    if (meta) {
      const updatedMeta = {
        ...meta,
        captured_count: result.capturedCount,
        declared_quantity: result.declaredQuantity,
        status: result.boxStatus,
        version: result.version,
      };
      ctx.boxMetaRef.current = { ...ctx.boxMetaRef.current, [boxCode]: updatedMeta };
      ctx.mutators.setBoxVersionByCode((prev) => ({ ...prev, [boxCode]: result.version }));
      ctx.mutators.setBoxMetaByCode((prev) => ({ ...prev, [boxCode]: updatedMeta }));
    }
    return true;
  } catch (err: unknown) {
    ctx.scannedSeriesRef.current = prevSeries;
    ctx.mutators.setScannedSeries(prevSeries);
    notify.error(err instanceof Error ? err.message : 'No se pudo eliminar el equipo');
    return false;
  }
}

export async function executeDeleteBox(ctx: PxBoxCommandContext, boxCode: string): Promise<boolean> {
  if (!ctx.receptionId) {
    notify.warning('Recepción no iniciada en servidor.');
    return false;
  }

  const meta = ctx.boxMetaRef.current[boxCode] ?? ctx.boxMetaByCode[boxCode];
  const isClosed =
    meta?.status === 'cerrada' || meta?.status === 'closed' || ctx.closedBoxes.includes(boxCode);
  if (isClosed) {
    notify.warning('No puede eliminar una caja cerrada. Reábrala primero si necesita modificarla.');
    return false;
  }

  const lotsInBox = ctx.manifestItems.filter((i) => i.boxCode === boxCode).length;
  const seriesInBox = ctx.scannedSeriesRef.current.filter((s) => s.boxCode === boxCode).length;
  const message =
    lotsInBox > 0 || seriesInBox > 0
      ? `¿Eliminar ${boxCode}? Se quitarán ${lotsInBox} lote(s) y ${seriesInBox} equipo(s) escaneado(s).`
      : `¿Eliminar la caja vacía ${boxCode}?`;
  if (
    !(await confirmDialog({
      title: 'Eliminar caja',
      message,
      tone: 'error',
      confirmText: 'Eliminar',
    }))
  ) {
    return false;
  }

  const boxId = ctx.boxIdByCode[boxCode];
  if (!boxId) {
    notify.warning('Caja no registrada en servidor.');
    return false;
  }

  const opId = await ctx.ensureOperatorId();
  if (!opId) {
    notify.warning('Sesión de usuario no lista.');
    return false;
  }

  const lockHeldByMe =
    meta?.locked_by &&
    opId &&
    meta.locked_by === opId &&
    meta.lock_expires_at &&
    new Date(meta.lock_expires_at) > new Date();

  if (!lockHeldByMe) {
    const ok = await ctx.onAcquireBoxLock(boxCode, boxId);
    if (!ok) return false;
  }

  try {
    await deletePxCaptureBoxApi({
      receptionId: ctx.receptionId,
      boxId,
      expectedVersion: ctx.boxVersionByCode[boxCode] ?? meta?.version ?? 1,
      operatorId: opId,
      operatorName: ctx.operatorName,
    });

    const nextSeries = ctx.scannedSeriesRef.current.filter((s) => s.boxCode !== boxCode);
    ctx.scannedSeriesRef.current = nextSeries;
    const nextManifest = ctx.manifestItems.filter((i) => i.boxCode !== boxCode);
    const { [boxCode]: _removedMeta, ...restMeta } = ctx.boxMetaRef.current;
    ctx.boxMetaRef.current = restMeta;

    ctx.mutators.setManifestItems(nextManifest);
    ctx.mutators.setScannedSeries(nextSeries);
    ctx.mutators.setClosedBoxes(ctx.closedBoxes.filter((b) => b !== boxCode));
    ctx.mutators.setBoxMetaByCode((prev) => {
      const { [boxCode]: _b, ...rest } = prev;
      return rest;
    });
    ctx.mutators.setBoxIdByCode((prev) => {
      const { [boxCode]: _b, ...rest } = prev;
      return rest;
    });
    ctx.mutators.setBoxVersionByCode((prev) => {
      const { [boxCode]: _b, ...rest } = prev;
      return rest;
    });
    if (ctx.selectedBoxForScan === boxCode) {
      ctx.setSelectedBoxForScan(null);
    }
    return true;
  } catch (err: unknown) {
    notify.error(err instanceof Error ? err.message : 'No se pudo eliminar la caja');
    await ctx.session.reconcile('ERROR_RECONCILIATION');
    return false;
  }
}
