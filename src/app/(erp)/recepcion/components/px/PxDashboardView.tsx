import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { TablePagination } from '@/components/ui/TablePagination';
import { notify, confirmDialog, promptDialog } from '@/components/ui';
import { useClientPagination } from '@/hooks/useClientPagination';
import { Scan, Box, Pencil, Trash2, CheckCircle2, Plus, FileText, ArrowRight, ArrowLeft, Lock, LockOpen } from 'lucide-react';
import {
  canClosePxBox,
  getPxActiveBoxCodes,
  getPxBoxStats,
  validatePxFinalizeReadiness,
  validatePxIncrementalFinalizeReadiness,
  canCreateNewPxBox,
} from '../../utils/pxBoxUtils';
import type { PxFinalizeProgress } from '../../services/pxIncrementalApi';
import type { PxBoxSnapshot } from '@/modules/recepcion/client/pxCapture';

export const PxDashboardView = (props: any) => {
  const {
    activeBoxCodes, boxLimitReached, boxMetaByCode, canFinalize,
    closedBoxCount, closedBoxes, finalizeCheck, guideData,
    handleAbandonReception, handleCreateNewBox, handleDeleteBox, handleEditBox,
    handleEnterBox, handleFinalizePX, incrementalReceptionId, isSubmittingPX,
    finalizeProgress,
    lastSavedAt, manifestItems, openBoxCount, openHeaderEdit,
    scannedSeries, useIncrementalCapture,
  } = props;
  const serverBoxes = Object.values(
    (boxMetaByCode || {}) as Record<string, PxBoxSnapshot>,
  );
  const totalAccepted = serverBoxes.reduce(
    (acc, box) => acc + (box.captured_count ?? 0),
    0,
  );
  const totalRejected = serverBoxes.reduce(
    (acc, box) => acc + (box.rejected_count ?? 0),
    0,
  );

  const prepPct =
    finalizeProgress && finalizeProgress.prepTotal > 0
      ? Math.min(100, Math.round((finalizeProgress.prepDone / finalizeProgress.prepTotal) * 100))
      : 0;
  const promotePct =
    finalizeProgress && finalizeProgress.promoteTotal > 0
      ? Math.min(100, Math.round((finalizeProgress.promoteDone / finalizeProgress.promoteTotal) * 100))
      : 0;
  const overallPct =
    finalizeProgress?.phase === 'prep'
      ? prepPct * 0.35
      : finalizeProgress
        ? 35 + promotePct * 0.65
        : 0;

  return (
      <div className="space-y-8 animate-rise-in">
        
        {/* Cabecera Resumen & Botón Cancelar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-xl font-black text-[var(--heading)] uppercase tracking-widest">Recepción en Curso</h2>
              <div className="flex gap-4 mt-1 text-xs font-bold text-slate-400 uppercase">
                <span>Pedido: {guideData.sap || 'N/A'}</span>
                <span>•</span>
                <span>Proveedor: {guideData.proveedorPx || 'N/A'}</span>
                <span>•</span>
                <span>Fecha: {new Date().toLocaleDateString('es-ES')}</span>
                <span>•</span>
                <span>REC: {guideData.guia || 'Asignando...'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {useIncrementalCapture && incrementalReceptionId ? (
              <span className="hidden lg:inline text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                Servidor ·{' '}
                {totalAccepted || scannedSeries.length}{' '}
                aceptadas ·{' '}
                {totalRejected}{' '}
                rechazadas · REC {guideData.guia}
              </span>
            ) : lastSavedAt ? (
              <span className="hidden lg:inline text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                Autoguardado {new Date(lastSavedAt).toLocaleTimeString('es-ES')} · {scannedSeries.length} series
              </span>
            ) : null}
            <Button
              variant="outline"
              onClick={openHeaderEdit}
              className="border-none text-slate-500 hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 font-black text-[11px] uppercase tracking-widest"
            >
              <Pencil className="w-4 h-4 mr-1" /> Editar cabecera
            </Button>
            <button
              type="button"
              onClick={handleAbandonReception}
              className="text-[10px] font-black uppercase tracking-widest text-rose-400 hover:text-rose-600 px-2"
            >
              Abandonar
            </button>
            <Button 
              variant="primary" 
              onClick={() => {
                if (!canFinalize) {
                  notify.warning(!finalizeCheck.ok ? finalizeCheck.reason : 'Complete y cierre todas las cajas antes de finalizar.');
                  return;
                }
                handleFinalizePX();
              }}
              disabled={!canFinalize || isSubmittingPX}
              title={!finalizeCheck.ok ? finalizeCheck.reason : 'Enviar cajas cerradas a Bodega Central'}
              className="bg-emerald-500 hover:bg-emerald-600 text-white h-12 px-6 font-black text-[11px] uppercase tracking-widest shadow-xl shadow-emerald-500/20 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />{' '}
              {isSubmittingPX ? 'Finalizando…' : 'Finalizar Recepción'}
            </Button>
          </div>
        </div>

        {finalizeProgress && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 px-5 py-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-800">
                {finalizeProgress.phase === 'prep' ? 'Fase 1 — Cajas a Bodega' : 'Fase 2 — Equipos a inventario'}
              </p>
              <span className="text-[10px] font-bold text-emerald-700 tabular-nums">
                {Math.round(overallPct)}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-emerald-100 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300 ease-out"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <p className="text-xs font-bold text-emerald-900">{finalizeProgress.label}</p>
            <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
              <span>
                Cajas {finalizeProgress.prepDone}/{finalizeProgress.prepTotal}
              </span>
              <span>
                Equipos {finalizeProgress.promoteDone}/{finalizeProgress.promoteTotal}
              </span>
            </div>
            <p className="text-[10px] text-emerald-600">
              El progreso se guarda por lote en el servidor. Si se interrumpe,
              la recepción seguirá visible para reanudarla desde el último lote.
            </p>
          </div>
        )}

        {!canFinalize && activeBoxCodes.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-amber-800">
              Para finalizar: complete cada caja, ciérrela con &quot;Cerrar caja&quot;, y luego use Finalizar Recepción.
            </p>
            {!finalizeCheck.ok && (
              <p className="text-xs font-bold text-amber-700 mt-1">{finalizeCheck.reason}</p>
            )}
          </div>
        )}

        {/* Resumen Global */}
        <div className="flex flex-col md:flex-row gap-6">
          <Card className="p-6 border-l-4 border-l-[var(--accent)] shadow-md w-full md:max-w-xs flex flex-col justify-between">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">Cajas en Proceso</h3>
              <Box className="w-5 h-5 text-[var(--accent)]" />
            </div>
            <div>
              <span className="text-4xl font-black text-[var(--heading)]">{activeBoxCodes.length}</span>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                {closedBoxCount} cerrada(s) · {openBoxCount} abierta(s)
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                De {guideData.totalCajasEsperadas} esperadas
              </p>
            </div>
          </Card>

          <div className="flex-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-[var(--heading)] uppercase tracking-widest flex items-center gap-2">
                <Box className="w-6 h-6 text-[var(--accent)]" />
                Cajas Activas
              </h2>
              <Button 
                onClick={handleCreateNewBox}
                disabled={boxLimitReached}
                title={boxLimitReached ? 'Edite la cabecera para aumentar la cantidad de cajas esperadas' : undefined}
                className="bg-[var(--heading)] hover:brightness-110 text-white font-black text-[10px] uppercase tracking-widest h-10 px-6 transition-all shadow-lg hover:shadow-xl disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4 mr-2" /> Nueva Caja
              </Button>
              {boxLimitReached && (
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mt-2 text-right">
                  Límite de {guideData.totalCajasEsperadas} caja(s) — edite la cabecera para agregar más
                </p>
              )}
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 h-full overflow-y-auto max-h-[500px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {activeBoxCodes.length === 0 && (
                  <div className="col-span-full py-20 text-center bg-white rounded-2xl border-2 border-dashed border-slate-200">
                    <Box className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Aún no hay cajas con equipos</h4>
                    <p className="text-[11px] text-slate-400 mt-2">Haz clic en Nueva Caja, agrega un lote y escanea series.</p>
                  </div>
                )}
            
            {activeBoxCodes.map((boxCode: string) => {
              const stats = getPxBoxStats(boxCode, manifestItems, scannedSeries);
              const boxItems = stats.lots;
              const meta = useIncrementalCapture ? boxMetaByCode?.[boxCode] : null;
              const totalExpected = meta?.declared_quantity ?? stats.totalExpected;
              const received = meta?.captured_count ?? stats.received;
              const rejected = meta?.rejected_count ?? 0;
              const isEmpty = received === 0;
              const isComplete = totalExpected > 0 && received >= totalExpected;
              const isClosed = useIncrementalCapture && meta
                ? meta.status === 'cerrada' || meta.status === 'closed'
                : closedBoxes.includes(boxCode);
              
              const uniqueModels = Array.from(new Set(boxItems.map((i: any) => `${i.marca} ${i.modelo}`)));

              return (
                <Card key={boxCode} className={`p-0 overflow-hidden shadow hover:shadow-md transition-all border-l-4 ${isClosed ? 'border-l-emerald-500' : isComplete ? 'border-l-[var(--heading)]' : 'border-l-[var(--accent)]'}`}>
                  <div className="p-3 flex justify-between items-start border-b border-slate-50">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-[var(--heading)] leading-none">{boxCode}</h4>
                        {isClosed && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-none text-[8px] font-black uppercase px-1.5 py-0">
                            <Lock className="w-2.5 h-2.5 mr-0.5 inline" /> Cerrada
                          </Badge>
                        )}
                        {isEmpty && !isClosed && (
                          <Badge className="border-none bg-slate-200 px-1.5 py-0 text-[8px] font-black uppercase text-slate-600">
                            Programada · vacía
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1.5 space-y-0.5">
                        {uniqueModels.map((m: string, idx: number) => (
                          <p key={idx} className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{m}</p>
                        ))}
                      </div>
                    </div>
                    {!isClosed && (
                      <div className="flex gap-2">
                        <button onClick={() => handleEditBox(boxCode)} className="text-slate-300 hover:text-[var(--accent)] transition-colors"><Pencil className="w-3 h-3" /></button>
                        <button onClick={() => handleDeleteBox(boxCode)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    )}
                  </div>
                  <div className="bg-slate-50/50 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="flex gap-2 text-[9px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">Decl. {totalExpected}</span>
                        <span className="text-emerald-600">Acept. {received}</span>
                        <span className="text-rose-600">Rech. {rejected}</span>
                      </div>
                      {isClosed ? <Lock className="w-3.5 h-3.5 text-emerald-500" /> : isComplete && <CheckCircle2 className="w-3.5 h-3.5 text-[var(--heading)]" />}
                    </div>
                    <Button 
                      onClick={() => handleEnterBox(boxCode)}
                      className={`w-full font-black text-[9px] uppercase tracking-widest h-8 transition-colors ${
                        isClosed
                          ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm shadow-emerald-500/20'
                          : isComplete 
                            ? 'bg-[var(--heading)] hover:brightness-110 text-white shadow-sm shadow-[var(--heading)]/20'
                            : 'bg-[var(--accent)] hover:opacity-90 text-white shadow-sm shadow-[var(--accent)]/20'
                      }`}
                    >
                      {isClosed
                        ? 'Ver caja cerrada'
                        : isComplete
                          ? 'Revisar y cerrar'
                          : isEmpty
                            ? 'Iniciar captura'
                            : 'Continuar armado'}{' '}
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};
