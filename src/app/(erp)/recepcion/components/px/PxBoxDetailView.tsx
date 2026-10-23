import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TablePagination } from '@/components/ui/TablePagination';
import { notify, confirmDialog, promptDialog } from '@/components/ui';
import { useClientPagination } from '@/hooks/useClientPagination';
import {
  Scan,
  Box,
  Pencil,
  Trash2,
  CheckCircle2,
  Plus,
  FileText,
  ArrowRight,
  ArrowLeft,
  Lock,
  LockOpen,
  ClipboardList,
} from 'lucide-react';
import { apiFetch, readApiJson } from '@/lib/http/apiFetch';
import { PREDIAGNOSTICO_BATCH_MAX } from '@/modules/backoffice/prediagnostico/batchSelection';
import { PxBoxPrediagnosticoPanel, type PxPrediagnosticoBatch } from './PxBoxPrediagnosticoPanel';
import {
  canClosePxBox,
  getPxActiveBoxCodes,
  getPxBoxStats,
  validatePxFinalizeReadiness,
  validatePxIncrementalFinalizeReadiness,
  canCreateNewPxBox,
} from '../../utils/pxBoxUtils';
import {
  getExpectedDigitsForSlot,
  modelHasDigitRules,
  prepareScannedSerial,
  resolveModelDigitRules,
  serialLengthCounterLabel,
  validateSerialLength,
} from '@/shared/validation/serialDigitRules';
import type { PxRejectedSerialScan } from '@/modules/recepcion/client/pxCapture';

export const PxBoxDetailView = (props: any) => {
  const {
    boxEditDisabled, boxItems, boxMeta, boxScannedSeries,
    boxSeriesPagination, canClose, currentEntry, currentScans,
    filteredBrands, filteredModels, handleAddLotToActiveBox, handleAddSN_PX,
    handleAdjustQuantityClick, handleBackToDashboard, handleCloseBox, handleDeleteEquipment,
    handleReopenBox, hasBoxLock, incrementalReceptionId, isBoxClosed,
    isBoxComplete,
    lastSavedAt, progressPct, received, scannedSerialUpperSet,
    scannedSeries, setCurrentEntry, setCurrentScans, systemModels,
    systemTechnologies, targetBox, totalExpected,
    useIncrementalCapture, guideData,
  } = props;
  const rejected = boxMeta?.rejected_count ?? 0;

  const [prediagBatch, setPrediagBatch] = useState<PxPrediagnosticoBatch | null>(null);
  const [prediagPick, setPrediagPick] = useState<Set<string>>(new Set());
  const [savedPrediagEquipment, setSavedPrediagEquipment] = useState<Set<string>>(new Set());

  const boxLotContext = useMemo(() => {
    type MetaLot = {
      brand_id?: string | null;
      model_id?: string | null;
      model_name?: string | null;
      technology_name?: string | null;
    };
    type BoxMetaShape = {
      brand_id?: string | null;
      model_id?: string | null;
      lots?: MetaLot[];
    };
    const meta = boxMeta as BoxMetaShape | null;
    const metaLots = meta?.lots || [];
    const metaLot = metaLots[metaLots.length - 1] || metaLots[0];

    const manifestLots = (boxItems as { boxCode?: string; tecnologia?: string; modelo?: string }[]).filter(
      (item) => item.boxCode === targetBox
    );
    const manifestLot = manifestLots[manifestLots.length - 1] || manifestLots[0];

    const modelNameHint = (metaLot?.model_name || manifestLot?.modelo || '').trim();
    const techNameHint = (metaLot?.technology_name || manifestLot?.tecnologia || '').trim();

    let modelId = meta?.model_id || metaLot?.model_id || '';
    let brandId = meta?.brand_id || metaLot?.brand_id || '';

    let model = modelId
      ? systemModels.find((m: { id: string }) => m.id === modelId)
      : undefined;
    if (!model && modelNameHint) {
      const hint = modelNameHint.toLowerCase();
      model = systemModels.find((m: { name?: string }) => {
        const name = (m.name || '').toLowerCase();
        return name === hint || name.includes(hint) || hint.includes(name);
      });
    }
    if (model) {
      modelId = modelId || model.id;
      brandId = brandId || model.brand_id || '';
    }

    const tech =
      systemTechnologies.find((t: { id: string }) => t.id === model?.technology_id) ||
      systemTechnologies.find((t: { name?: string }) => t.name === techNameHint);
    const techId = tech?.id || model?.technology_id || '';

    return {
      techId: techId || '',
      brandId: brandId || '',
      modelId: modelId || '',
      techName: tech?.name || techNameHint,
      modelName: model?.name || modelNameHint,
    };
  }, [boxItems, targetBox, systemModels, systemTechnologies, boxMeta]);

  const equipmentIdsInBox = useMemo(
    () =>
      (boxScannedSeries as { equipmentId?: string }[])
        .map((row) => row.equipmentId)
        .filter((id): id is string => Boolean(id && !id.startsWith('pending-'))),
    [boxScannedSeries]
  );

  const refreshSavedPrediag = useCallback(async () => {
    if (!useIncrementalCapture || equipmentIdsInBox.length === 0) {
      setSavedPrediagEquipment(new Set());
      return;
    }
    const ctx = boxLotContext;
    if (!ctx.modelId) return;
    const params = new URLSearchParams({
      equipmentIds: equipmentIdsInBox.slice(0, 200).join(','),
    });
    if (ctx.techId) params.set('techId', ctx.techId);
    if (ctx.brandId) params.set('brandId', ctx.brandId);
    params.set('modelId', ctx.modelId);
    try {
      const res = await apiFetch(`/api/v1/recepcion/px/prediagnostico?${params}`, { cache: 'no-store' });
      const body = await readApiJson<{ savedEquipmentIds?: string[] }>(res);
      if (!res.ok) return;
      setSavedPrediagEquipment(new Set(body.savedEquipmentIds || []));
    } catch {
      setSavedPrediagEquipment(new Set());
    }
  }, [useIncrementalCapture, equipmentIdsInBox, boxLotContext]);

  useEffect(() => {
    void refreshSavedPrediag();
  }, [refreshSavedPrediag]);

  const canPrediagRow = (row: { equipmentId?: string }) =>
    Boolean(useIncrementalCapture && row.equipmentId && !row.equipmentId.startsWith('pending-'));

  const openPrediagnosticoForRows = (rows: { equipmentId?: string; sn?: string }[]) => {
    const ctx = boxLotContext;
    if (!ctx.modelId) {
      notify.warning('No se pudo resolver el modelo del lote en esta caja.');
      return;
    }
    const picked = rows.filter((row) => canPrediagRow(row));
    if (picked.length === 0) {
      notify.warning('Espere a que el servidor confirme el escaneo antes de pre-diagnosticar.');
      return;
    }
    if (picked.length > PREDIAGNOSTICO_BATCH_MAX) {
      notify.warning(`Máximo ${PREDIAGNOSTICO_BATCH_MAX} equipos por lote`);
      return;
    }
    setPrediagBatch({
      equipmentIds: picked.map((row) => row.equipmentId as string),
      serialLabels: picked.map((row) => row.sn || row.equipmentId || ''),
      techId: ctx.techId,
      brandId: ctx.brandId,
      modelId: ctx.modelId,
      techName: ctx.techName,
      modelName: ctx.modelName,
    });
    requestAnimationFrame(() => {
      document.getElementById('px-prediagnostico-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const togglePrediagPick = (equipmentId: string) => {
    setPrediagPick((prev) => {
      const next = new Set(prev);
      if (next.has(equipmentId)) next.delete(equipmentId);
      else next.add(equipmentId);
      return next;
    });
  };

  const prediagEligibleIds = useMemo(
    () =>
      (boxScannedSeries as { equipmentId?: string }[])
        .filter((row) => canPrediagRow(row))
        .map((row) => String(row.equipmentId)),
    [boxScannedSeries, useIncrementalCapture]
  );

  const prediagEligibleOnPageIds = useMemo(
    () =>
      (boxSeriesPagination.slice as { equipmentId?: string }[])
        .filter((row) => canPrediagRow(row))
        .map((row) => String(row.equipmentId)),
    [boxSeriesPagination.slice, useIncrementalCapture]
  );

  const allEligibleSelected =
    prediagEligibleIds.length > 0 && prediagEligibleIds.every((id) => prediagPick.has(id));
  const allPageEligibleSelected =
    prediagEligibleOnPageIds.length > 0 &&
    prediagEligibleOnPageIds.every((id) => prediagPick.has(id));
  const somePageEligibleSelected = prediagEligibleOnPageIds.some((id) => prediagPick.has(id));

  const selectAllPrediagInBox = () => {
    if (!useIncrementalCapture || prediagEligibleIds.length === 0) return;
    const capped = prediagEligibleIds.slice(0, PREDIAGNOSTICO_BATCH_MAX);
    if (prediagEligibleIds.length > PREDIAGNOSTICO_BATCH_MAX) {
      notify.warning(
        `Hay ${prediagEligibleIds.length} equipos; solo se seleccionan ${PREDIAGNOSTICO_BATCH_MAX} (límite masivo).`
      );
    }
    setPrediagPick(new Set(capped));
  };

  const clearPrediagPick = () => setPrediagPick(new Set());

  const toggleSelectAllPrediagOnPage = () => {
    if (!useIncrementalCapture || prediagEligibleOnPageIds.length === 0) return;
    setPrediagPick((prev) => {
      const next = new Set(prev);
      if (allPageEligibleSelected) {
        prediagEligibleOnPageIds.forEach((id) => next.delete(id));
        return next;
      }
      let warned = false;
      for (const id of prediagEligibleOnPageIds) {
        if (next.size >= PREDIAGNOSTICO_BATCH_MAX && !next.has(id)) {
          if (!warned) {
            notify.warning(`Máximo ${PREDIAGNOSTICO_BATCH_MAX} equipos por pre-diagnóstico masivo.`);
            warned = true;
          }
          break;
        }
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6 animate-rise-in">
      <div className={`rounded-xl border px-4 py-3 text-sm font-black ${guideData?.inventoryDestination === 'OBSOLETE' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
        Destino: {guideData?.inventoryDestination === 'OBSOLETE' ? 'Bodega de Obsoleto' : 'Bodega Central (Vigentes)'}
      </div>
      <div className="flex flex-wrap items-center gap-4 mb-2">
        <Button 
          variant="outline" 
          onClick={handleBackToDashboard}
          className="border-none text-slate-500 hover:text-[var(--heading)] hover:bg-slate-100 font-black text-[11px] uppercase tracking-widest h-10 px-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Volver a Cajas Activas
        </Button>
        {useIncrementalCapture && incrementalReceptionId ? (
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
            Servidor · {scannedSeries.filter((s: any) => s.boxCode === targetBox).length} en esta caja
          </span>
        ) : lastSavedAt ? (
          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
            Autoguardado {new Date(lastSavedAt).toLocaleTimeString('es-ES')} · {scannedSeries.length} series totales
          </span>
        ) : null}
        {isBoxClosed ? (
          <Button
            variant="outline"
            onClick={() => handleReopenBox(targetBox)}
            className="ml-auto border-amber-200 text-amber-700 hover:bg-amber-50 font-black text-[10px] uppercase tracking-widest h-10"
          >
            <LockOpen className="w-4 h-4 mr-2" /> Reabrir caja
          </Button>
        ) : canClose ? (
          <Button
            onClick={() => handleCloseBox(targetBox)}
            className="ml-auto bg-emerald-500 hover:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest h-10 shadow-lg shadow-emerald-500/20"
          >
            <Lock className="w-4 h-4 mr-2" /> Cerrar caja
          </Button>
        ) : useIncrementalCapture && received > 0 && !isBoxClosed ? (
          <Button
            onClick={() => handleCloseBox(targetBox)}
            className="ml-auto bg-amber-500 hover:bg-amber-600 text-white font-black text-[10px] uppercase tracking-widest h-10"
          >
            <Lock className="w-4 h-4 mr-2" /> Cerrar parcial
          </Button>
        ) : null}
      </div>

      {useIncrementalCapture && boxMeta && !hasBoxLock && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          {boxMeta.locked_by ? (
            <>
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-800">
                Caja en uso por otro operador — solo lectura
              </p>
              <p className="text-xs font-bold text-amber-700 mt-1">
                Espere a que libere el control o pida a un supervisor reasignar la caja.
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] font-black uppercase tracking-widest text-amber-800">
                Debe tomar control de la caja antes de escanear
              </p>
              <p className="text-xs font-bold text-amber-700 mt-1">
                El control se tomará automáticamente al registrar el primer equipo, o al entrar a la caja.
              </p>
            </>
          )}
        </div>
      )}

      {isBoxClosed && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 flex items-center gap-3">
          <Lock className="w-5 h-5 text-emerald-600 shrink-0" />
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-800">Caja cerrada — solo lectura</p>
            <p className="text-xs font-bold text-emerald-700 mt-1">
              {useIncrementalCapture
                ? `Caja cerrada en servidor${boxMeta?.is_partial_box ? ' (parcial)' : ''}. Use "Reabrir caja" para seguir escaneando o ajustando.`
                : `Los ${received} equipos están guardados localmente. Reabra la caja solo si necesita corregir algo antes de finalizar la recepción.`}
            </p>
            {useIncrementalCapture && boxMeta?.is_partial_box && boxMeta.partial_box_reason ? (
              <p className="text-[10px] font-bold text-emerald-600 mt-2">
                Motivo parcial: {boxMeta.partial_box_reason}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {useIncrementalCapture && received === 0 && rejected > 0 && (
        <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3">
          <p className="text-[11px] font-black uppercase tracking-widest text-rose-800">
            No es posible finalizar esta caja
          </p>
          <p className="mt-1 text-xs font-bold text-rose-700">
            No se registró ninguna unidad. {rejected} intento(s) fueron rechazados por existir en
            otras Órdenes de Servicio abiertas.
          </p>
        </div>
      )}

      {isBoxComplete && !isBoxClosed && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-emerald-300 bg-emerald-50 px-5 py-4 flex items-center gap-3"
        >
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-800">
              Caja llena — {received}/{totalExpected} equipos
            </p>
            <p className="mt-1 text-xs font-bold text-emerald-700">
              No se permiten más lecturas en esta caja. Ciérrela y continúe en la siguiente.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => handleCloseBox(targetBox)}
            className="ml-auto h-10 shrink-0 bg-emerald-600 px-4 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-700"
          >
            <Lock className="mr-2 h-4 w-4" /> Cerrar caja
          </Button>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-8">
        
        {/* COLUMNA IZQUIERDA: CREACIÓN DE LOTES Y RESUMEN */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-6">
          <Card className="border-l-4 border-l-[var(--accent)] shadow-xl p-0 overflow-hidden">
            <div className="bg-[var(--heading)] p-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <Box className="w-5 h-5 text-[var(--accent)]" />
                <h3 className="text-sm font-black uppercase tracking-widest">Caja Activa</h3>
              </div>
              <Badge className="bg-white/10 text-white border-none font-black">{targetBox}</Badge>
            </div>

            <div className="p-5 space-y-6 bg-slate-50">
              {!isBoxClosed && !boxEditDisabled && (
              <div className="space-y-4">
                <h4 className="text-[11px] font-black text-[var(--heading)] uppercase tracking-widest border-b border-slate-200 pb-2">Agregar Lote a {targetBox}</h4>
                
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tecnología</label>
                    <select 
                      className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[var(--accent)] transition-colors"
                      value={currentEntry.tecnologia}
                      onChange={(e) => setCurrentEntry({...currentEntry, tecnologia: e.target.value, marca: '', modelo: ''})}
                    >
                      <option value="">Seleccione...</option>
                      {systemTechnologies.map((t: any) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Marca</label>
                      <select
                        className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[var(--accent)] transition-colors"
                        value={currentEntry.marca}
                        onChange={(e) => setCurrentEntry({...currentEntry, marca: e.target.value, modelo: ''})}
                      >
                        <option value="">Seleccione...</option>
                        {filteredBrands.map((b: any) => (
                          <option key={b.id} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">Modelo</label>
                      <select
                        className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[var(--accent)] transition-colors"
                        value={currentEntry.modelo}
                        onChange={(e) => setCurrentEntry({...currentEntry, modelo: e.target.value})}
                      >
                        <option value="">Seleccione...</option>
                        {filteredModels.map((m: any) => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Cant. Equipos</label>
                    <input 
                      type="number" 
                      min="1"
                      placeholder="Ej: 50"
                      className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[var(--accent)] transition-colors"
                      value={currentEntry.totalEsperado || ''}
                      onChange={(e) => setCurrentEntry({...currentEntry, totalEsperado: parseInt(e.target.value) || 0})}
                    />
                  </div>

                  <Button 
                    onClick={handleAddLotToActiveBox}
                    className="w-full h-12 mt-2 bg-[var(--heading)] hover:brightness-110 text-white text-[11px] uppercase font-black tracking-widest rounded-lg shadow-lg shadow-[var(--heading)]/20"
                  >
                    + Agregar Lote
                  </Button>
                </div>
              </div>
              )}

              {useIncrementalCapture && boxMeta && !isBoxClosed && hasBoxLock && received > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4 space-y-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">
                      Cantidad declarada: {totalExpected}
                      {boxMeta.declared_quantity_original &&
                      boxMeta.declared_quantity_original !== totalExpected ? (
                        <span className="text-slate-400 font-bold ml-1">
                          (orig. {boxMeta.declared_quantity_original})
                        </span>
                      ) : null}
                    </p>
                    {boxMeta.quantity_adjustment_reason ? (
                      <p className="text-[10px] font-bold text-amber-700 mt-1">
                        Ajuste: {boxMeta.quantity_adjustment_reason}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleAdjustQuantityClick()}
                    className="w-full h-10 border-amber-300 text-amber-800 hover:bg-amber-100 font-black text-[10px] uppercase tracking-widest"
                  >
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Ajustar cantidad a recibir
                  </Button>
                </div>
              )}

              {/* Lotes Agregados */}
              <div className="pt-4 border-t border-slate-200">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Lotes en la Caja</h4>
                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                  {boxItems.length === 0 ? (
                    <p className="text-[10px] text-slate-400 italic">No hay lotes configurados.</p>
                  ) : (
                    boxItems.map((item: any) => (
                      <div key={item.id} className="bg-white p-3 rounded-lg border border-slate-200 flex justify-between items-center shadow-sm">
                        <div>
                          <p className="text-[11px] font-black text-[var(--heading)]">{item.marca} {item.modelo}</p>
                          <p className="text-[9px] font-bold text-[var(--accent)] uppercase">{item.tecnologia}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-black text-slate-500">{item.totalEsperado} und</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </Card>
        </div>

        {/* COLUMNA DERECHA: ESCÁNER Y TABLA */}
        <div className="lg:col-span-8 xl:col-span-9 transition-all duration-300">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            
            {/* Escáner */}
            <div className="lg:col-span-4 xl:col-span-4 flex flex-col gap-6">
              <Card className="p-6 border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                <div className="mb-6 flex justify-between items-center">
                  <h3 className="text-[13px] font-black text-[var(--heading)] uppercase tracking-widest">Escáner de Series</h3>
                </div>
                <form onSubmit={(e) => {
                  if (isBoxClosed) {
                    e.preventDefault();
                    notify.warning('Esta caja está cerrada. Reábrala para escanear más equipos.');
                    return;
                  }
                  if (isBoxComplete) {
                    e.preventDefault();
                    notify.warning(`Caja ${targetBox} llena: ${received}/${totalExpected}.`, {
                      description: 'Cierre esta caja y continúe en la siguiente.',
                    });
                    return;
                  }
                  if (boxEditDisabled) {
                    e.preventDefault();
                    notify.warning('No tiene control de esta caja. Espere a que el otro operador libere el lock.');
                    return;
                  }
                  handleAddSN_PX(e);
                }} className="flex flex-col gap-5">
                  {(() => {
                    const lastItem = boxItems[boxItems.length - 1];
                    const model = lastItem
                      ? systemModels.find((m: any) => m.name === lastItem.modelo)
                      : null;
                    const digitRules = resolveModelDigitRules(model);
                    const expectedScans = lastItem
                      ? digitRules.seriesCount ||
                        (lastItem.tecnologia === 'EMTA' ? 4 : 1)
                      : 1;
                    
                    return (
                      <div className="flex flex-col gap-5">
                        {Array.from({ length: expectedScans }).map((_, idx) => {
                          const currentVal = currentScans[idx] || '';
                          const currentPrepared = prepareScannedSerial(currentVal);
                          const expectedDigits = getExpectedDigitsForSlot(
                            digitRules.digitsPerSeries,
                            idx
                          );
                          const hasRules = modelHasDigitRules(model);
                          const lengthOk =
                            currentPrepared.length === 0 ||
                            (hasRules &&
                              expectedDigits != null &&
                              currentPrepared.length === expectedDigits);
                          const lengthWarn =
                            hasRules &&
                            expectedDigits != null &&
                            currentPrepared.length > 0 &&
                            currentPrepared.length !== expectedDigits;
                          const isDuplicate = currentPrepared !== '' && (
                            scannedSerialUpperSet.has(currentPrepared) ||
                            currentScans.some((v: string, i: number) => i !== idx && prepareScannedSerial(v) === currentPrepared)
                          );

                          return (
                            <div key={idx} className="space-y-2 relative">
                              <label className="text-[10px] font-black uppercase text-slate-400">
                                Serie {idx + 1} *
                                {expectedDigits ? (
                                  <span className="ml-2 text-[var(--muted)] normal-case tracking-normal font-bold">
                                    ({expectedDigits} caracteres)
                                  </span>
                                ) : (
                                  <span className="ml-2 text-amber-600 normal-case tracking-normal font-bold">
                                    (sin longitud configurada)
                                  </span>
                                )}
                              </label>
                              <input 
                                id={`scan-input-${idx}`}
                                type="text" 
                                value={currentVal}
                                onChange={(e) => {
                                  const newScans = [...currentScans];
                                  newScans[idx] = e.target.value;
                                  setCurrentScans(newScans);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    if (isDuplicate) {
                                      e.preventDefault();
                                      return;
                                    }
                                    if (currentPrepared.length > 0) {
                                      const check = validateSerialLength(
                                        currentPrepared,
                                        expectedDigits
                                      );
                                      if (!check.valid) {
                                        e.preventDefault();
                                        notify.warning(check.title, {
                                          description: check.message,
                                        });
                                        return;
                                      }
                                    }
                                    if (idx < expectedScans - 1) {
                                      e.preventDefault();
                                      const nextInput = document.getElementById(`scan-input-${idx + 1}`);
                                      if (nextInput) nextInput.focus();
                                    }
                                  }
                                }}
                                placeholder={
                                  expectedDigits
                                    ? `Escanear Serie ${idx + 1} (${expectedDigits} caracteres)...`
                                    : `Escanear Serie ${idx + 1}...`
                                }
                                className={`w-full h-12 px-4 bg-white border-2 rounded-lg text-sm font-mono font-bold outline-none transition-colors shadow-inner uppercase ${
                                  isDuplicate || lengthWarn
                                    ? 'border-rose-500 text-rose-600 focus:border-rose-500 bg-rose-50'
                                    : 'border-slate-200 focus:border-[var(--accent)]'
                                }`}
                                autoFocus={idx === 0 && !isBoxComplete && !isBoxClosed && !boxEditDisabled}
                                disabled={boxItems.length === 0 || isBoxComplete || boxEditDisabled}
                              />
                              <div className="flex justify-between items-center min-h-[1rem]">
                                {isDuplicate ? (
                                  <span className="text-[10px] text-rose-500 font-bold">
                                    Esta serie ya fue escaneada
                                  </span>
                                ) : lengthWarn && expectedDigits ? (
                                  <span className="text-[10px] text-rose-500 font-bold">
                                    {currentPrepared.length < expectedDigits
                                      ? 'Serial incompleto'
                                      : 'Longitud incorrecta — no se truncará'}
                                  </span>
                                ) : (
                                  <span />
                                )}
                                <span
                                  className={`text-[10px] font-bold ${
                                    lengthWarn ? 'text-amber-600' : 'text-slate-400'
                                  }`}
                                >
                                  {serialLengthCounterLabel(currentPrepared.length, expectedDigits)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <Button 
                    type="submit" 
                    disabled={boxItems.length === 0 || isBoxComplete || boxEditDisabled}
                    className="w-full h-12 bg-[var(--heading)] hover:brightness-110 text-white text-[11px] uppercase tracking-widest font-black rounded-lg mt-2 shadow-lg shadow-[var(--heading)]/20 disabled:opacity-50"
                  >
                    {isBoxClosed
                      ? 'Caja cerrada'
                      : isBoxComplete
                        ? `Caja llena · ${received}/${totalExpected}`
                        : boxEditDisabled
                          ? 'Sin control de caja'
                          : 'Registrar Equipo (Enter)'}
                  </Button>
                </form>
              </Card>

              {/* Progreso */}
              <Card className="p-6 border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                <div className="mb-4">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Progreso: {targetBox}</h3>
                </div>
                <div className="mb-4 grid grid-cols-3 gap-2">
                  <div>
                    <span className="block text-[9px] font-black uppercase tracking-widest text-slate-400">Declaradas</span>
                    <span className="text-2xl font-black tabular-nums text-[var(--heading)]">{totalExpected}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase tracking-widest text-emerald-600">Aceptadas</span>
                    <span className="text-2xl font-black tabular-nums text-emerald-700">{received}</span>
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase tracking-widest text-rose-600">Rechazadas</span>
                    <span className="text-2xl font-black tabular-nums text-rose-700">{rejected}</span>
                  </div>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-400 transition-all duration-500 ease-out" 
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                {boxMeta?.rejections?.length > 0 && (
                  <div className="mt-4 max-h-28 space-y-1 overflow-y-auto border-t border-slate-100 pt-3">
                    {boxMeta.rejections.slice(0, 5).map((item: PxRejectedSerialScan) => (
                      <div key={item.id} className="flex items-center justify-between gap-2 text-[9px]">
                        <span className="truncate font-mono font-black text-rose-700">{item.serial_number}</span>
                        <span className="shrink-0 font-bold text-slate-500">
                          {item.error_code} · {item.existing_os_number || 'S/OS'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Tabla Series */}
            <div className="lg:col-span-8 xl:col-span-8 space-y-4">
              {prediagBatch ? (
                <PxBoxPrediagnosticoPanel
                  batch={prediagBatch}
                  onClose={() => setPrediagBatch(null)}
                  onSaved={() => {
                    setPrediagBatch(null);
                    setPrediagPick(new Set());
                    void refreshSavedPrediag();
                  }}
                />
              ) : null}
              <Card padding="none" className="overflow-hidden h-full border-2 border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col">
                <div className="bg-white border-b border-slate-100 p-5 flex flex-wrap justify-between items-center gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[11px] font-black text-[var(--heading)] uppercase tracking-widest">Equipos Escaneados</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!useIncrementalCapture || prediagEligibleIds.length === 0 || allEligibleSelected}
                      className="!text-[10px] font-black uppercase tracking-widest"
                      onClick={selectAllPrediagInBox}
                    >
                      Seleccionar todas ({Math.min(prediagEligibleIds.length, PREDIAGNOSTICO_BATCH_MAX)})
                    </Button>
                    {prediagPick.size > 0 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="!text-[10px] font-bold uppercase tracking-widest text-slate-500"
                        onClick={clearPrediagPick}
                      >
                        Quitar selección
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={prediagPick.size === 0 || !useIncrementalCapture}
                      className="!text-[10px] font-black uppercase tracking-widest"
                      leftIcon={<ClipboardList className="h-3.5 w-3.5" />}
                      onClick={() => {
                        const rows = boxScannedSeries.filter(
                          (row: { equipmentId?: string }) =>
                            row.equipmentId && prediagPick.has(row.equipmentId)
                        );
                        openPrediagnosticoForRows(rows);
                      }}
                    >
                      Pre-diag. masivo ({prediagPick.size})
                    </Button>
                    {prediagBatch ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="!text-[10px] font-bold text-slate-500"
                        onClick={() => setPrediagBatch(null)}
                      >
                        Cerrar formulario
                      </Button>
                    ) : null}
                  </div>
                </div>
                <div className="overflow-x-auto flex-1 bg-white">
                  {(() => {
                    const showMulti = boxItems.some((item: any) => (systemModels.find((m: any) => m.name === item.modelo)?.series_count > 1 || item.tecnologia === 'EMTA'));
                    
                    return (
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead>
                          <tr className="bg-slate-50/80 border-b text-[10px] font-black uppercase text-slate-400">
                            <th className="px-3 py-4 w-10 text-center">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5"
                                disabled={
                                  !useIncrementalCapture || prediagEligibleOnPageIds.length === 0
                                }
                                checked={allPageEligibleSelected}
                                ref={(el) => {
                                  if (el) {
                                    el.indeterminate =
                                      somePageEligibleSelected && !allPageEligibleSelected;
                                  }
                                }}
                                onChange={toggleSelectAllPrediagOnPage}
                                title="Seleccionar todas las series de esta página"
                                aria-label="Seleccionar todas las series de esta página"
                              />
                            </th>
                            <th className="px-6 py-4">S-1</th>
                            {showMulti && (
                              <>
                                <th className="px-6 py-4">S-2</th>
                                <th className="px-6 py-4">S-3</th>
                                <th className="px-6 py-4">S-4</th>
                              </>
                            )}
                            <th className="px-6 py-4">Ingreso</th>
                            <th className="px-6 py-4 text-right">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {boxScannedSeries.length === 0 && (
                            <tr>
                              <td colSpan={showMulti ? 7 : 4} className="px-6 py-20 text-center">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <Scan className="w-8 h-8 text-slate-300" />
                                </div>
                                <h4 className="text-[12px] font-black text-[var(--heading)] uppercase tracking-widest">La caja está vacía</h4>
                                <p className="text-[10px] font-bold text-slate-400 mt-2">
                                  {boxItems.length > 0 ? 'Agregue lotes y escanee equipos.' : 'Primero agregue un lote a la caja en el panel lateral.'}
                                </p>
                              </td>
                            </tr>
                          )}
                          {boxSeriesPagination.slice.map((s: any, idx: number) => {
                            const equipmentId = String(s.equipmentId || '');
                            const canPrediag = canPrediagRow(s);
                            const hasPred = equipmentId ? savedPrediagEquipment.has(equipmentId) : false;
                            return (
                            <tr key={`${s.sn}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-3 py-4 text-center">
                                <input
                                  type="checkbox"
                                  className="h-3.5 w-3.5"
                                  disabled={!canPrediag}
                                  checked={equipmentId ? prediagPick.has(equipmentId) : false}
                                  onChange={() => togglePrediagPick(equipmentId)}
                                  title={
                                    canPrediag
                                      ? 'Incluir en pre-diagnóstico masivo'
                                      : 'Espere confirmación del servidor tras escanear'
                                  }
                                />
                              </td>
                              <td className="px-6 py-4 font-mono font-black text-[var(--heading)]">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      hasPred ? 'bg-[var(--accent)]' : canPrediag ? 'bg-emerald-500' : 'bg-slate-300'
                                    }`}
                                    title={
                                      hasPred
                                        ? 'Pre-diagnóstico registrado'
                                        : canPrediag
                                          ? 'Listo para pre-diagnóstico'
                                          : 'Pendiente de sync'
                                    }
                                  />
                                  {s.sn}
                                </div>
                              </td>
                              {showMulti && (
                                <>
                                  <td className="px-6 py-4 font-mono text-slate-500">{s.s2 || '-'}</td>
                                  <td className="px-6 py-4 font-mono text-slate-500">{s.s3 || '-'}</td>
                                  <td className="px-6 py-4 font-mono text-slate-500">{s.s4 || '-'}</td>
                                </>
                              )}
                              <td className="px-6 py-4">
                                {Number(s.reentryCount) > 1 ? (
                                  <span
                                    className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full border ${
                                      s.ingressWarranty
                                        ? 'bg-violet-50 text-violet-700 border-violet-200'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}
                                  >
                                    {s.ingressWarranty
                                      ? `${s.reentryCount}° · Garantía`
                                      : `${s.reentryCount}° Ingreso`}
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                    1° Ingreso
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-1">
                                  <button
                                    type="button"
                                    disabled={!canPrediag}
                                    onClick={() => openPrediagnosticoForRows([s])}
                                    className="p-1.5 hover:bg-[var(--accent)]/10 rounded-lg group transition-colors disabled:opacity-30"
                                    title={
                                      canPrediag
                                        ? 'Pre-diagnóstico individual'
                                        : 'Espere confirmación del servidor tras escanear'
                                    }
                                  >
                                    <ClipboardList className="w-3.5 h-3.5 text-slate-300 group-hover:text-[var(--accent)]" />
                                  </button>
                                  {!isBoxClosed ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteEquipment({ ...s, boxCode: targetBox })}
                                      className="p-1.5 hover:bg-rose-50 rounded-lg group transition-colors"
                                      title="Eliminar Equipo"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-slate-300 group-hover:text-rose-500" />
                                    </button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                  {boxScannedSeries.length > 0 && (
                    <TablePagination
                      totalCount={boxSeriesPagination.totalCount}
                      page={boxSeriesPagination.page}
                      totalPages={boxSeriesPagination.totalPages}
                      startItem={boxSeriesPagination.startItem}
                      endItem={boxSeriesPagination.endItem}
                      pageSize={boxSeriesPagination.pageSize}
                      onPageChange={boxSeriesPagination.setPage}
                      itemLabel="equipos"
                    />
                  )}
                </div>
              </Card>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
};
