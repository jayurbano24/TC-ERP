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

export const PxBoxDetailView = (props: any) => {
  const {
    boxEditDisabled, boxItems, boxMeta, boxScannedSeries,
    boxSeriesPagination, canClose, currentEntry, currentScans,
    filteredBrands, filteredModels, handleAddLotToActiveBox, handleAddSN_PX,
    handleAdjustQuantityClick, handleBackToDashboard, handleCloseBox, handleDeleteEquipment,
    handleReopenBox, hasBoxLock, incrementalReceptionId, isBoxClosed,
    lastSavedAt, progressPct, received, scannedSerialUpperSet,
    scannedSeries, setCurrentEntry, setCurrentScans, systemModels,
    systemTechnologies, targetBox, totalExpected,
    useIncrementalCapture,
  } = props;

  return (
    <div className="space-y-6 animate-rise-in">
      <div className="flex flex-wrap items-center gap-4 mb-2">
        <Button 
          variant="outline" 
          onClick={handleBackToDashboard}
          className="border-none text-slate-500 hover:text-[#181c3a] hover:bg-slate-100 font-black text-[11px] uppercase tracking-widest h-10 px-4"
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

      <div className="grid lg:grid-cols-12 gap-8">
        
        {/* COLUMNA IZQUIERDA: CREACIÓN DE LOTES Y RESUMEN */}
        <div className="lg:col-span-4 xl:col-span-3 space-y-6">
          <Card className="border-l-4 border-l-[#2ec4f1] shadow-xl p-0 overflow-hidden">
            <div className="bg-[#181c3a] p-5 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <Box className="w-5 h-5 text-[#2ec4f1]" />
                <h3 className="text-sm font-black uppercase tracking-widest">Caja Activa</h3>
              </div>
              <Badge className="bg-white/10 text-white border-none font-black">{targetBox}</Badge>
            </div>

            <div className="p-5 space-y-6 bg-slate-50">
              {!isBoxClosed && !boxEditDisabled && (
              <div className="space-y-4">
                <h4 className="text-[11px] font-black text-[#181c3a] uppercase tracking-widest border-b border-slate-200 pb-2">Agregar Lote a {targetBox}</h4>
                
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">Tecnología</label>
                    <select 
                      className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#2ec4f1] transition-colors"
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
                        className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#2ec4f1] transition-colors"
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
                        className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#2ec4f1] transition-colors"
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
                      className="w-full bg-white border-2 border-slate-200 rounded-lg p-2.5 text-xs font-bold outline-none focus:border-[#2ec4f1] transition-colors"
                      value={currentEntry.totalEsperado || ''}
                      onChange={(e) => setCurrentEntry({...currentEntry, totalEsperado: parseInt(e.target.value) || 0})}
                    />
                  </div>

                  <Button 
                    onClick={handleAddLotToActiveBox}
                    className="w-full h-12 mt-2 bg-[#181c3a] hover:bg-[#252b57] text-white text-[11px] uppercase font-black tracking-widest rounded-lg shadow-lg shadow-[#181c3a]/20"
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
                          <p className="text-[11px] font-black text-[#181c3a]">{item.marca} {item.modelo}</p>
                          <p className="text-[9px] font-bold text-[#2ec4f1] uppercase">{item.tecnologia}</p>
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
                  <h3 className="text-[13px] font-black text-[#181c3a] uppercase tracking-widest">Escáner de Series</h3>
                </div>
                <form onSubmit={(e) => {
                  if (isBoxClosed) {
                    e.preventDefault();
                    notify.warning('Esta caja está cerrada. Reábrala para escanear más equipos.');
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
                    const expectedScans = lastItem ? (systemModels.find((m: any) => m.name === lastItem.modelo)?.series_count || (lastItem.tecnologia === 'EMTA' ? 4 : 1)) : 1;
                    
                    return (
                      <div className="flex flex-col gap-5">
                        {Array.from({ length: expectedScans }).map((_, idx) => {
                          const currentVal = currentScans[idx] || '';
                          const currentUpper = currentVal.trim().toUpperCase();
                          const isDuplicate = currentUpper !== '' && (
                            scannedSerialUpperSet.has(currentUpper) ||
                            currentScans.some((v: string, i: number) => i !== idx && v.trim().toUpperCase() === currentUpper)
                          );

                          return (
                            <div key={idx} className="space-y-2 relative">
                              <label className="text-[10px] font-black uppercase text-slate-400">Serie {idx + 1} *</label>
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
                                    if (idx < expectedScans - 1) {
                                      e.preventDefault();
                                      const nextInput = document.getElementById(`scan-input-${idx + 1}`);
                                      if (nextInput) nextInput.focus();
                                    }
                                  }
                                }}
                                placeholder={`Escanear Serie ${idx + 1}...`}
                                className={`w-full h-12 px-4 bg-white border-2 rounded-lg text-sm font-mono font-bold outline-none transition-colors shadow-inner uppercase ${isDuplicate ? 'border-rose-500 text-rose-600 focus:border-rose-500 bg-rose-50' : 'border-slate-200 focus:border-[#2ec4f1]'}`}
                                autoFocus={idx === 0 && !isBoxClosed && !boxEditDisabled}
                                disabled={boxItems.length === 0 || boxEditDisabled}
                              />
                              {isDuplicate && (
                                <span className="text-[10px] text-rose-500 font-bold absolute -bottom-4 left-0">
                                  ⚠️ Esta serie ya fue escaneada
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                  <Button 
                    type="submit" 
                    disabled={boxItems.length === 0 || boxEditDisabled}
                    className="w-full h-12 bg-[#181c3a] hover:bg-[#252b57] text-white text-[11px] uppercase tracking-widest font-black rounded-lg mt-2 shadow-lg shadow-[#181c3a]/20 disabled:opacity-50"
                  >
                    {isBoxClosed ? 'Caja cerrada' : boxEditDisabled ? 'Sin control de caja' : 'Registrar Equipo (Enter)'}
                  </Button>
                </form>
              </Card>

              {/* Progreso */}
              <Card className="p-6 border-2 border-slate-100 shadow-xl shadow-slate-200/50">
                <div className="mb-4">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Progreso: {targetBox}</h3>
                </div>
                <div className="flex items-end gap-2 mb-4">
                  <span className="text-4xl font-black text-[#181c3a] leading-none">{received}</span>
                  <span className="text-sm font-bold text-slate-400 mb-1">/ {totalExpected} equipos</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-400 transition-all duration-500 ease-out" 
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </Card>
            </div>

            {/* Tabla Series */}
            <div className="lg:col-span-8 xl:col-span-8">
              <Card padding="none" className="overflow-hidden h-full border-2 border-slate-100 shadow-xl shadow-slate-200/50 flex flex-col">
                <div className="bg-white border-b border-slate-100 p-5 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[11px] font-black text-[#181c3a] uppercase tracking-widest">Equipos Escaneados</h3>
                  </div>
                </div>
                <div className="overflow-x-auto flex-1 bg-white">
                  {(() => {
                    const showMulti = boxItems.some((item: any) => (systemModels.find((m: any) => m.name === item.modelo)?.series_count > 1 || item.tecnologia === 'EMTA'));
                    
                    return (
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead>
                          <tr className="bg-slate-50/80 border-b text-[10px] font-black uppercase text-slate-400">
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
                              <td colSpan={showMulti ? 6 : 3} className="px-6 py-20 text-center">
                                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <Scan className="w-8 h-8 text-slate-300" />
                                </div>
                                <h4 className="text-[12px] font-black text-[#181c3a] uppercase tracking-widest">La caja está vacía</h4>
                                <p className="text-[10px] font-bold text-slate-400 mt-2">
                                  {boxItems.length > 0 ? 'Agregue lotes y escanee equipos.' : 'Primero agregue un lote a la caja en el panel lateral.'}
                                </p>
                              </td>
                            </tr>
                          )}
                          {boxSeriesPagination.slice.map((s: any, idx: number) => (
                            <tr key={`${s.sn}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 font-mono font-black text-[#181c3a]">
                                <div className="flex items-center gap-2">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
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
                                  <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                    {s.reentryCount}° Ingreso
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                    1° Ingreso
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-right">
                                {!isBoxClosed && (
                                <div className="flex justify-end gap-1">
                                  <button 
                                    onClick={() => handleDeleteEquipment({ ...s, boxCode: targetBox })}
                                    className="p-1.5 hover:bg-rose-50 rounded-lg group transition-colors"
                                    title="Eliminar Equipo"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-slate-300 group-hover:text-rose-500" />
                                  </button>
                                </div>
                                )}
                              </td>
                            </tr>
                          ))}
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
