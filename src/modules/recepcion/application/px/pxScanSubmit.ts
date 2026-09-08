import { startTransition } from 'react';
import { notify } from '@/components/ui';
import {
  previewEquipmentReentry,
  formatIngresoLabel,
} from '@/modules/recepcion/client/receptions';
import {
  scanPxEquipmentApi,
  DuplicateOpenOsError,
  type ScanPxEquipmentResult,
} from '@/app/(erp)/recepcion/services/pxIncrementalApi';
import { recordPxScan } from '@/modules/recepcion/client/pxReceptionSessionMetrics';
import { getWorkstationLabel } from '@/app/(erp)/recepcion/utils/pxWorkstation';
import {
  resolveModelDigitRules,
  prepareScannedSerial,
  validateScanSlotsAgainstDigitRules,
} from '@/shared/validation/serialDigitRules';
import type { PxManifestItem, PxScannedSeries } from '@/app/(erp)/recepcion/types/reception.types';
import type { PxBoxSnapshot } from '@/modules/recepcion/client/pxCapture';
import type { PxCatalogBrand, PxCatalogModel, PxOperationalMutators, PxSessionCommands } from './pxCommandTypes';
import {
  attachReentryCountToSeries,
  buildOptimisticScanPatch,
  buildScannedSerialSet,
  reconcileScanSeriesWithResult,
} from './pxScanCommands';

export type PxScanSubmitContext = {
  receptionId: string | null;
  selectedBoxForScan: string | null;
  currentScans: string[];
  manifestItems: PxManifestItem[];
  boxIdByCode: Record<string, string>;
  boxMetaByCode: Record<string, PxBoxSnapshot>;
  boxVersionByCode: Record<string, number>;
  systemBrands: PxCatalogBrand[];
  systemModels: PxCatalogModel[];
  operatorName: string;
  ensureOperatorId: () => Promise<string | null>;
  operatorIdRef: React.MutableRefObject<string | null>;
  onAcquireBoxLock: (boxCode: string, boxId: string) => Promise<boolean>;
  session: Pick<PxSessionCommands, 'reconcile' | 'scheduleSoftReconciliation'>;
  mutators: PxOperationalMutators;
  setCurrentScans: (value: string[]) => void;
  setLastSyncedAt: (value: string | null) => void;
  scannedSeriesRef: React.MutableRefObject<PxScannedSeries[]>;
  boxMetaRef: React.MutableRefObject<Record<string, PxBoxSnapshot>>;
  getLiveScannedSeries: () => PxScannedSeries[];
};

export async function executePxScanSubmit(ctx: PxScanSubmitContext): Promise<void> {
  const liveSeries = ctx.getLiveScannedSeries();

  if (!ctx.receptionId) {
    notify.warning('Recepción no iniciada en servidor.');
    return;
  }
  if (!ctx.selectedBoxForScan) {
    notify.warning('Seleccione una caja primero.');
    return;
  }

  const boxCode = ctx.selectedBoxForScan;
  const boxId = ctx.boxIdByCode[boxCode];
  if (!boxId) {
    notify.warning('La caja no está registrada en servidor. Agregue un lote primero.');
    return;
  }

  if (!ctx.currentScans[0]?.trim()) return;

  const boxLot = ctx.manifestItems.find((i) => i.boxCode === boxCode);
  const model =
    ctx.systemModels.find((m) => m.name === boxLot?.modelo) ||
    ctx.systemModels.find((m) => m.id === ctx.boxMetaByCode[boxCode]?.model_id);
  const digitRules = resolveModelDigitRules(model as Parameters<typeof resolveModelDigitRules>[0]);
  const digitCheck = validateScanSlotsAgainstDigitRules(ctx.currentScans, digitRules);
  if (!digitCheck.ok) {
    notify.warning(digitCheck.message, { description: digitCheck.description });
    return;
  }

  const opId = ctx.operatorIdRef.current ?? (await ctx.ensureOperatorId());
  if (!opId) {
    notify.warning('Sesión de usuario no lista. Espere un momento o recargue la página.');
    return;
  }

  const meta = ctx.boxMetaRef.current[boxCode] ?? ctx.boxMetaByCode[boxCode];
  const declared = meta?.declared_quantity ?? 0;
  const captured = meta?.captured_count ?? 0;
  if (declared > 0 && captured >= declared) {
    notify.warning(`Caja ${boxCode} llena: ${captured}/${declared} equipos.`, {
      description: 'No se permiten más equipos. Cierre esta caja y continúe en la siguiente.',
      duration: 8000,
    });
    return;
  }

  const validScans = ctx.currentScans.map((s) => prepareScannedSerial(s)).filter(Boolean);
  if (new Set(validScans).size !== validScans.length) {
    notify.warning('Duplicado en el mismo equipo', {
      description:
        'Las series S1–S4 no pueden repetirse en un mismo escaneo. Corrija la grilla e intente de nuevo.',
    });
    return;
  }

  const scannedSet = buildScannedSerialSet(liveSeries);
  if (validScans.some((v) => scannedSet.has(v))) {
    notify.warning('Duplicado en el mismo lote', {
      description:
        'Una o más series ya fueron capturadas en esta recepción o caja PX. Quite el duplicado de la grilla.',
    });
    return;
  }

  const lockHeldByMe =
    meta?.locked_by &&
    opId &&
    meta.locked_by === opId &&
    meta.lock_expires_at &&
    new Date(meta.lock_expires_at) > new Date();

  if (!lockHeldByMe) {
    const ok = await ctx.onAcquireBoxLock(boxCode, boxId);
    if (!ok) return;
  }

  const scanPayload = {
    receptionId: ctx.receptionId,
    boxId,
    mainSerial: validScans[0]!,
    serialS2: ctx.currentScans[1]?.trim(),
    serialS3: ctx.currentScans[2]?.trim(),
    serialS4: ctx.currentScans[3]?.trim(),
    brandId: ctx.systemBrands.find((b) => b.name === boxLot?.marca)?.id || meta?.brand_id,
    modelId: ctx.systemModels.find((m) => m.name === boxLot?.modelo)?.id || meta?.model_id,
    material: boxLot?.material,
    operatorId: opId,
    operatorName: ctx.operatorName,
    workstationLabel: getWorkstationLabel(),
  };

  const patch = buildOptimisticScanPatch({
    boxCode,
    currentScans: ctx.currentScans,
    validScans,
    material: boxLot?.material,
    liveSeries,
    meta,
    boxVersion: ctx.boxVersionByCode[boxCode],
  });

  ctx.scannedSeriesRef.current = patch.nextSeries;
  if (meta) {
    ctx.boxMetaRef.current = {
      ...ctx.boxMetaRef.current,
      [boxCode]: {
        ...meta,
        captured_count: patch.optimisticResult.capturedCount,
        declared_quantity: patch.optimisticResult.declaredQuantity,
        status: patch.optimisticResult.boxStatus,
      },
    };
  }

  startTransition(() => {
    ctx.mutators.setScannedSeries(patch.nextSeries);
    ctx.mutators.setBoxMetaByCode((prev) => {
      const current = prev[boxCode];
      if (!current) return prev;
      return {
        ...prev,
        [boxCode]: {
          ...current,
          captured_count: patch.optimisticResult.capturedCount,
          declared_quantity: patch.optimisticResult.declaredQuantity,
          status: patch.optimisticResult.boxStatus,
        },
      };
    });
    ctx.mutators.setBoxVersionByCode((prev) => ({
      ...prev,
      [boxCode]: (prev[boxCode] ?? 1) + 1,
    }));
    ctx.setCurrentScans(['', '', '', '']);
    ctx.setLastSyncedAt(new Date().toISOString());
  });
  setTimeout(() => document.getElementById('scan-input-0')?.focus(), 10);

  const rollback = () => {
    ctx.scannedSeriesRef.current = patch.seriesBeforePending;
    if (patch.rollbackMeta) {
      ctx.boxMetaRef.current = { ...ctx.boxMetaRef.current, [boxCode]: patch.rollbackMeta };
    }
    startTransition(() => {
      ctx.mutators.setScannedSeries(patch.seriesBeforePending);
      ctx.setCurrentScans(patch.rollbackScans);
      if (patch.rollbackMeta) {
        ctx.mutators.setBoxMetaByCode((prev) => ({ ...prev, [boxCode]: patch.rollbackMeta! }));
      }
      if (patch.rollbackVersion !== undefined) {
        ctx.mutators.setBoxVersionByCode((prev) => ({ ...prev, [boxCode]: patch.rollbackVersion! }));
      }
    });
  };

  const reconcile = (result: ScanPxEquipmentResult) => {
    const reconciled = reconcileScanSeriesWithResult(
      ctx.scannedSeriesRef.current,
      patch.pendingId,
      result
    );
    ctx.scannedSeriesRef.current = reconciled;
    if (meta) {
      ctx.boxMetaRef.current = {
        ...ctx.boxMetaRef.current,
        [boxCode]: {
          ...(ctx.boxMetaRef.current[boxCode] ?? meta),
          captured_count: result.capturedCount,
          declared_quantity: result.declaredQuantity,
          status: result.boxStatus,
        },
      };
    }
    startTransition(() => {
      ctx.mutators.setScannedSeries(reconciled);
      ctx.mutators.setBoxMetaByCode((prev) => {
        const current = prev[boxCode];
        if (!current) return prev;
        return {
          ...prev,
          [boxCode]: {
            ...current,
            captured_count: result.capturedCount,
            declared_quantity: result.declaredQuantity,
            status: result.boxStatus,
          },
        };
      });
    });
    ctx.session.scheduleSoftReconciliation();
  };

  const attachReentryPreview = async (equipmentId: string) => {
    try {
      const serials = [
        scanPayload.mainSerial,
        scanPayload.serialS2,
        scanPayload.serialS3,
        scanPayload.serialS4,
      ].filter(Boolean) as string[];
      const count = await previewEquipmentReentry(serials);
      if (count <= 1) return;
      const patched = attachReentryCountToSeries(
        ctx.scannedSeriesRef.current,
        equipmentId,
        patch.pendingId,
        count
      );
      ctx.scannedSeriesRef.current = patched;
      startTransition(() => ctx.mutators.setScannedSeries(patched));
      notify.info(`${formatIngresoLabel(count)} detectado (PX)`, {
        description: `La serie ${serials[0]} ya estuvo en el sistema y vuelve a ingresar.`,
      });
    } catch {
      /* preview opcional */
    }
  };

  const submitScan = async (retryOnLock = false): Promise<boolean> => {
    try {
      recordPxScan();
      const result = await scanPxEquipmentApi(scanPayload);
      reconcile(result);
      void attachReentryPreview(result.equipmentId);
      if (result.declaredQuantity > 0 && result.capturedCount >= result.declaredQuantity) {
        notify.success(`Caja ${boxCode} completada`, {
          description: `${result.capturedCount}/${result.declaredQuantity} equipos. El escáner quedó bloqueado; cierre la caja para continuar.`,
          duration: 10000,
        });
      }
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al guardar escaneo en servidor';
      if (!retryOnLock && message.includes('tomar control')) {
        const ok = await ctx.onAcquireBoxLock(boxCode, boxId);
        if (ok) return submitScan(true);
      }
      rollback();
      if (err instanceof DuplicateOpenOsError) {
        const duplicate = err.details;
        await ctx.session.reconcile('ERROR_RECONCILIATION');
        notify.error('SERIE DUPLICADA – ORDEN DE SERVICIO ABIERTA', {
          description:
            `La serie ${duplicate.serial} ya está registrada en otra OS abierta. ` +
            `OS: ${duplicate.existing_os_number || 'sin número'} · ` +
            `Estado: ${duplicate.existing_os_status || 'sin estado'}. ` +
            'Esta unidad NO fue ingresada ni contabilizada. Resuelva la OS existente antes de reintentar.',
          duration: 15000,
        });
      } else if (message.includes('caja alcanzó su capacidad') || message.includes('BOX_FULL')) {
        await ctx.session.reconcile('ERROR_RECONCILIATION');
        notify.warning(`Caja ${boxCode} llena`, {
          description:
            'El equipo no fue registrado. Cierre esta caja y seleccione o cree la siguiente.',
          duration: 10000,
        });
      } else {
        notify.error(message);
      }
      return false;
    }
  };

  await submitScan();
}
