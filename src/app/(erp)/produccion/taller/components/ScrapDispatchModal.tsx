'use client';

import { memo } from 'react';
import { Button, notify } from '@/components/ui';
import {
  Package, X, BarChart3, ScanLine, Layers, Trash2,
  AlertCircle, CheckCircle2, RotateCcw, Loader2, Send,
} from 'lucide-react';

type Props = {
  filteredTasks: any[];
  catMarcas: any[];
  catModelos: any[];
  catTecnologias: any[];
  scrapScannedItems: any[];
  setScrapScannedItems: (updater: any) => void;
  scrapScanError: string;
  setScrapScanError: (v: string) => void;
  scrapBoxStep: 'crear_caja' | 'despacho';
  setScrapBoxStep: (v: 'crear_caja' | 'despacho') => void;
  scrapBoxMarca: string;
  setScrapBoxMarca: (v: string) => void;
  scrapBoxModelo: string;
  setScrapBoxModelo: (v: string) => void;
  scrapBoxTecnologia: string;
  setScrapBoxTecnologia: (v: string) => void;
  scrapBoxCantidad: number | '';
  setScrapBoxCantidad: (v: number | '') => void;
  scrapGuideNumber: string;
  setScrapGuideNumber: (v: string) => void;
  scrapActiveView: 'resumen' | 'pistolero';
  setScrapActiveView: (v: 'resumen' | 'pistolero') => void;
  scrapScanSN: string;
  setScrapScanSN: (v: string) => void;
  scrapNotes: string;
  setScrapNotes: (v: string) => void;
  scrapDispatching: boolean;
  setScrapDispatching: (v: boolean) => void;
  generateConduceNumber: () => string;
  fetchTasks: () => void;
  onClose: () => void;
};

/**
 * C1: modal de Despacho SCRAP (full-featured) extraído del monolito
 * produccion/taller y memoizado. El estado vive en el padre; los handlers
 * internos usan únicamente props. El cierre + reset se unifica en onClose.
 */
export const ScrapDispatchModal = memo(function ScrapDispatchModal({
  filteredTasks,
  catMarcas,
  catModelos,
  catTecnologias,
  scrapScannedItems,
  setScrapScannedItems,
  scrapScanError,
  setScrapScanError,
  scrapBoxStep,
  setScrapBoxStep,
  scrapBoxMarca,
  setScrapBoxMarca,
  scrapBoxModelo,
  setScrapBoxModelo,
  scrapBoxTecnologia,
  setScrapBoxTecnologia,
  scrapBoxCantidad,
  setScrapBoxCantidad,
  scrapGuideNumber,
  setScrapGuideNumber,
  scrapActiveView,
  setScrapActiveView,
  scrapScanSN,
  setScrapScanSN,
  scrapNotes,
  setScrapNotes,
  scrapDispatching,
  setScrapDispatching,
  generateConduceNumber,
  fetchTasks,
  onClose,
}: Props) {
  const registerScan = () => {
    const snVal = scrapScanSN.trim().toUpperCase();
    if (!snVal) { setScrapScanError('El SN es obligatorio'); return; }
    if (scrapScannedItems.find((i: any) => i.sn === snVal)) { setScrapScanError(`"${snVal}" ya fue registrado en esta caja`); setScrapScanSN(''); return; }
    const found = filteredTasks.find(t =>
      (t.all_sns || [t.sn]).map((s: string) => s.toUpperCase()).includes(snVal)
    );
    if (!found) {
      setScrapScanError(`"${snVal}" no está en estatus SCRAP — solo se pueden despachar equipos en cola SCRAP`);
      return;
    }
    const idx = scrapScannedItems.length;
    setScrapScannedItems((prev: any[]) => [...prev, {
      num: idx + 1,
      sn: snVal,
      os: found.id,
      marca: found.marca,
      modelo: found.modelo,
      dbId: found.dbId,
      all_dbIds: found.all_dbIds,
      usuario: 'Actual'
    }]);
    setScrapScanSN('');
    setScrapScanError('');
    document.getElementById('scrap-sn-input')?.focus();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#181c3a]/60 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <div className="max-w-4xl w-full bg-white rounded-t-[1.75rem] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh] sm:max-h-[90vh] animate-rise-in my-0 sm:my-4">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-rose-600 to-rose-400 p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-2xl">
              <Package className="w-7 h-7 text-white" />
            </div>
            <div>
              <p className="text-[9px] font-black text-white/60 uppercase tracking-[0.25em]">Taller · Producción</p>
              <h2 className="text-2xl font-black text-white">Despacho SCRAP</h2>
              <p className="text-[11px] text-white/70 mt-0.5">
                {filteredTasks.length} equipo(s) en cola SCRAP · {scrapScannedItems.length} seleccionado(s) para despacho
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-2 hover:bg-white/20 rounded-xl transition-all"
          ><X className="w-5 h-5" /></button>
        </div>

        {/* ── Sub-nav (solo visible en paso despacho) ── */}
        {scrapBoxStep === 'despacho' && (
          <div className="flex gap-1 px-6 pt-4 pb-0 bg-slate-50 border-b border-slate-100 shrink-0">
            {([['resumen', BarChart3, 'Resumen SCRAP'], ['pistolero', ScanLine, 'Pistolero / Scanner']] as const).map(([view, Icon, label]) => (
              <button
                key={view}
                onClick={() => setScrapActiveView(view)}
                className={`flex items-center gap-2 px-5 py-3 text-[10px] font-black uppercase tracking-widest rounded-t-xl transition-all ${
                  scrapActiveView === view
                    ? 'bg-white border-2 border-b-white border-slate-100 text-rose-600 -mb-px z-10'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" />{label}
                {view === 'pistolero' && scrapScannedItems.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 bg-rose-500 text-white rounded-full text-[9px] font-black">{scrapScannedItems.length}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">

          {/* ── PASO 1: CREAR CAJA ── */}
          {scrapBoxStep === 'crear_caja' && (
            <div className="p-8 space-y-6">
              {/* Título paso */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center text-sm font-black">1</div>
                <div>
                  <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-wider">Detalle de la Caja</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Ingresa los datos del lote a despachar antes de escanear</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Marca */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                    Marca <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={scrapBoxMarca}
                    onChange={e => { setScrapBoxMarca(e.target.value); setScrapBoxModelo(''); }}
                    className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">Seleccionar marca...</option>
                    {catMarcas.map((m: any) => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>

                {/* Modelo */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                    Modelo <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={scrapBoxModelo}
                    onChange={e => setScrapBoxModelo(e.target.value)}
                    className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors appearance-none cursor-pointer disabled:opacity-50"
                    disabled={!scrapBoxMarca}
                  >
                    <option value="">{scrapBoxMarca ? 'Seleccionar modelo...' : 'Primero selecciona una marca'}</option>
                    {catModelos
                      .filter((m: any) => {
                        if (!scrapBoxMarca) return true;
                        const marca = catMarcas.find((b: any) => b.name === scrapBoxMarca);
                        return marca ? m.brand_id === marca.id : true;
                      })
                      .map((m: any) => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))
                    }
                  </select>
                </div>

                {/* Tecnología */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                    Tecnología <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={scrapBoxTecnologia}
                    onChange={e => setScrapBoxTecnologia(e.target.value)}
                    className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">Seleccionar tecnología...</option>
                    {catTecnologias.map((t: any) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* Cantidad */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                    Cantidad <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={scrapBoxCantidad}
                    onChange={e => setScrapBoxCantidad(e.target.value === '' ? '' : parseInt(e.target.value))}
                    placeholder="Ej: 10"
                    className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors"
                  />
                </div>
              </div>

              {/* Resumen visual */}
              {(scrapBoxMarca || scrapBoxModelo || scrapBoxTecnologia || scrapBoxCantidad) && (
                <div className="bg-rose-50 border-2 border-rose-100 rounded-2xl p-5 flex flex-wrap gap-4">
                  {scrapBoxMarca && (
                    <div>
                      <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Marca</p>
                      <p className="text-sm font-black text-[#181c3a]">{scrapBoxMarca}</p>
                    </div>
                  )}
                  {scrapBoxModelo && (
                    <div>
                      <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Modelo</p>
                      <p className="text-sm font-black text-[#181c3a]">{scrapBoxModelo}</p>
                    </div>
                  )}
                  {scrapBoxTecnologia && (
                    <div>
                      <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Tecnología</p>
                      <p className="text-sm font-black text-[#181c3a]">{scrapBoxTecnologia}</p>
                    </div>
                  )}
                  {scrapBoxCantidad !== '' && (
                    <div>
                      <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest">Cantidad</p>
                      <p className="text-sm font-black text-[#181c3a]">{scrapBoxCantidad} unidades</p>
                    </div>
                  )}
                </div>
              )}

              {/* Botón continuar */}
              <button
                onClick={() => {
                  if (!scrapBoxMarca || !scrapBoxModelo || !scrapBoxTecnologia || scrapBoxCantidad === '') {
                    notify.warning('Completa todos los campos: Marca, Modelo, Tecnología y Cantidad.');
                    return;
                  }
                  setScrapGuideNumber(generateConduceNumber());
                  setScrapBoxStep('despacho');
                  setScrapActiveView('pistolero');
                }}
                className="w-full py-4 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-black text-sm uppercase tracking-widest transition-all shadow-lg shadow-rose-500/25 flex items-center justify-center gap-3 active:scale-[0.99]"
              >
                <Layers className="w-5 h-5" />
                Crear Caja y Continuar
              </button>
            </div>
          )}

          {/* VIEW: RESUMEN */}
          {scrapBoxStep === 'despacho' && scrapActiveView === 'resumen' && (() => {
            const groups: Record<string, {marca: string, modelo: string, tecnologia: string, cantidad: number, items: any[]}> = {};
            filteredTasks.forEach(t => {
              const key = `${t.marca}||${t.modelo}||${t.tecnologia}`;
              if (!groups[key]) groups[key] = { marca: t.marca, modelo: t.modelo, tecnologia: t.tecnologia, cantidad: 0, items: [] };
              groups[key].cantidad += (t.all_sns?.length || 1);
              groups[key].items.push(t);
            });
            const groupList = Object.values(groups);
            return (
              <div className="p-6 space-y-5">
                {filteredTasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Trash2 className="w-12 h-12 text-rose-200 mb-4" />
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Sin equipos en SCRAP</p>
                    <p className="text-xs text-slate-300 mt-1">Los equipos marcados como irreparables aparecerán aquí</p>
                  </div>
                ) : (
                  <>
                    {/* Tabla agrupada */}
                    <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
                      <table className="w-full">
                        <thead className="bg-rose-500">
                          <tr>
                            {['Marca', 'Modelo', 'Tecnología', 'Cantidad', 'Series'].map(h => (
                              <th key={h} className="px-5 py-4 text-left text-[9px] font-black uppercase tracking-widest text-white">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {groupList.map((g, i) => (
                            <tr key={i} className="hover:bg-rose-50/30 transition-colors">
                              <td className="px-5 py-4">
                                <span className="text-xs font-black text-[#181c3a] uppercase">{g.marca}</span>
                              </td>
                              <td className="px-5 py-4">
                                <span className="text-xs font-bold text-slate-600 uppercase">{g.modelo}</span>
                              </td>
                              <td className="px-5 py-4">
                                <span className="text-[10px] font-bold text-slate-400 uppercase">{g.tecnologia}</span>
                              </td>
                              <td className="px-5 py-4">
                                <span className="inline-flex items-center justify-center w-8 h-8 bg-rose-100 text-rose-700 rounded-xl text-sm font-black">{g.cantidad}</span>
                              </td>
                              <td className="px-5 py-4">
                                <div className="flex flex-wrap gap-1">
                                  {g.items.flatMap(it => it.all_sns || [it.sn]).slice(0,3).map((sn: string, si: number) => (
                                    <span key={si} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-mono">{sn}</span>
                                  ))}
                                  {g.cantidad > 3 && <span className="px-2 py-0.5 bg-rose-100 text-rose-500 rounded text-[9px] font-bold">+{g.cantidad - 3}</span>}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-100">
                          <tr>
                            <td colSpan={3} className="px-5 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">TOTAL</td>
                            <td className="px-5 py-3">
                              <span className="inline-flex items-center justify-center w-8 h-8 bg-rose-500 text-white rounded-xl text-sm font-black">
                                {filteredTasks.reduce((a, t) => a + (t.all_sns?.length || 1), 0)}
                              </span>
                            </td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold text-center">Usa el tab <span className="text-rose-500">Pistolero / Scanner</span> para seleccionar y despachar</p>
                  </>
                )}
              </div>
            );
          })()}

          {/* VIEW: PISTOLERO */}
          {scrapBoxStep === 'despacho' && scrapActiveView === 'pistolero' && (
            <div className="p-6 grid grid-cols-2 gap-5 h-full">

              {/* LEFT: Escáner de Series + Progreso */}
              <div className="space-y-5">

                {/* Escáner card */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                  <h3 className="text-sm font-black text-[#181c3a]">Escáner de Series</h3>

                  {/* Campo SN único */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-xs font-black text-slate-700">SN <span className="text-rose-500">*</span></label>
                      <span className="text-[10px] font-bold text-slate-400">Max: 15</span>
                    </div>
                    <input
                      id="scrap-sn-input"
                      autoFocus
                      type="text"
                      maxLength={15}
                      value={scrapScanSN}
                      onChange={e => { setScrapScanSN(e.target.value.toUpperCase()); setScrapScanError(''); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') registerScan();
                      }}
                      placeholder="Escanear SN (15 dig)..."
                      className={`w-full px-4 py-3 border rounded-xl text-sm font-mono font-bold outline-none transition-colors ${
                        scrapScanError ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white focus:border-rose-400'
                      }`}
                    />
                    <div className="flex justify-end mt-1">
                      <span className="text-[10px] font-bold text-slate-400">{scrapScanSN.length} / 15</span>
                    </div>
                  </div>

                  {/* Error */}
                  {scrapScanError && (
                    <p className="text-[10px] font-black text-rose-500 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />{scrapScanError}
                    </p>
                  )}

                  {/* Botón registrar */}
                  <button
                    onClick={registerScan}
                    className="w-full py-3.5 bg-[#181c3a] hover:bg-[#232848] text-white font-black text-sm rounded-xl transition-all active:scale-[0.99] tracking-wider"
                  >
                    Registrar Equipo (Enter)
                  </button>
                </div>

                {/* Progreso de la Caja */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black text-slate-500">Progreso de la Caja</h3>
                  </div>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-3xl font-black text-[#181c3a]">{scrapScannedItems.length}</span>
                    <span className="text-sm font-bold text-slate-400">/ {scrapBoxCantidad || '—'} equipos</span>
                  </div>
                  {/* Barra de progreso */}
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: scrapBoxCantidad
                          ? `${Math.min(100, (scrapScannedItems.length / (scrapBoxCantidad as number)) * 100)}%`
                          : '0%',
                        background: scrapScannedItems.length >= (scrapBoxCantidad as number)
                          ? 'linear-gradient(90deg,#10b981,#34d399)'
                          : 'linear-gradient(90deg,#f43f5e,#fb7185)'
                      }}
                    />
                  </div>
                  {typeof scrapBoxCantidad === 'number' && scrapScannedItems.length >= scrapBoxCantidad && scrapBoxCantidad > 0 && (
                    <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-2 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Caja completa
                    </p>
                  )}
                </div>
              </div>

              {/* RIGHT: Tabla Contenido de la Caja */}
              <div className="flex flex-col h-full">
                <h3 className="text-sm font-black text-[#181c3a] mb-3">Contenido de la Caja</h3>

                {/* Tabla */}
                <div className="flex-1 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                  {scrapScannedItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <ScanLine className="w-10 h-10 text-rose-200 mb-3" />
                      <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Registra equipos con el escáner</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto overflow-y-auto max-h-[420px] custom-scrollbar">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                          <tr>
                            <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">#</th>
                            <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">SAP</th>
                            <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">SN</th>
                            <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">Usuario</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {[...scrapScannedItems].reverse().map((sc, i) => (
                            <tr key={i} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3 py-3">
                                <span className="text-[10px] font-black text-slate-400">{scrapScannedItems.length - i}</span>
                              </td>
                              <td className="px-3 py-3">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                  OK (SN)
                                </span>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-xs font-black text-emerald-600 font-mono">{sc.sn}</span>
                              </td>
                              <td className="px-3 py-3">
                                <span className="text-[10px] font-bold text-slate-500">{sc.usuario || 'Actual'}</span>
                              </td>
                              <td className="px-3 py-3">
                                <button
                                  onClick={() => setScrapScannedItems((prev: any[]) => prev.filter((_, idx) => idx !== (scrapScannedItems.length - 1 - i)))}
                                  className="text-slate-300 hover:text-rose-400 transition-colors p-1 rounded-lg hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}

          {/* Conduce + Notas + Botón — visible en paso despacho debajo del pistolero */}
          {scrapBoxStep === 'despacho' && (
            <div className="px-6 pb-6 space-y-3">
              {/* Conduce de Salida de Scraps */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Conduce de Salida de Scraps <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setScrapGuideNumber(generateConduceNumber())}
                    className="text-[9px] font-black text-rose-500 hover:text-rose-700 uppercase tracking-widest flex items-center gap-1 transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Regenerar
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={scrapGuideNumber}
                    onChange={e => setScrapGuideNumber(e.target.value)}
                    placeholder="CS-SCRAP-2026-001"
                    className="w-full pl-4 pr-28 py-3 bg-rose-50 border-2 border-rose-200 rounded-xl text-sm font-black text-rose-700 outline-none focus:border-rose-400 transition-colors font-mono tracking-wider"
                  />
                  {scrapGuideNumber && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[9px] font-black text-rose-400 uppercase tracking-widest">
                      <CheckCircle2 className="w-3.5 h-3.5 text-rose-400" />
                      Generado
                    </span>
                  )}
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Notas</label>
                <textarea
                  value={scrapNotes}
                  onChange={e => setScrapNotes(e.target.value)}
                  placeholder="Destino, proveedor de reciclaje..."
                  rows={2}
                  className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors resize-none"
                />
              </div>

              {/* Botón confirmar */}
              <Button
                variant="primary"
                className="w-full bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 font-black py-4"
                rightIcon={scrapDispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                onClick={async () => {
                  if (scrapScannedItems.length === 0) { notify.warning('Escanea al menos un equipo antes de despachar.'); return; }
                  if (!scrapGuideNumber.trim()) { notify.warning('Ingresa o genera el número de conduce.'); return; }
                  setScrapDispatching(true);
                  try {
                    const { logAdvancedAudit } = await import('@/lib/database/audit');
                    const { updateSeriesStatus } = await import('@/lib/database/workshop');
                    for (const sc of scrapScannedItems) {
                      const ids = sc.all_dbIds || [sc.dbId];
                      for (const id of ids) {
                        await updateSeriesStatus(id, 'dispatched');
                        await logAdvancedAudit({
                          module: 'Taller',
                          tableName: 'series',
                          recordId: id,
                          action: 'SCRAP DESPACHADO',
                          severity: 'WARNING',
                          newValues: { conduce: scrapGuideNumber, notes: scrapNotes, serial: sc.sn, os: sc.os, modelo: sc.modelo }
                        });
                      }
                    }
                    notify.success(`${scrapScannedItems.length} equipo(s) despachados`, { description: `Guía: ${scrapGuideNumber}` });
                    onClose();
                    fetchTasks();
                  } catch (err: any) {
                    notify.error('Error en el despacho', { description: err.message });
                  }
                  setScrapDispatching(false);
                }}
              >
                {scrapDispatching ? 'Despachando...' : `Confirmar Despacho (${scrapScannedItems.length})`}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
