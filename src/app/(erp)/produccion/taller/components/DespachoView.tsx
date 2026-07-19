'use client';

import { memo } from 'react';
import { Card, Button, Badge, notify, confirmDialog } from '@/components/ui';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  Send, Plus, Package, Eye, Printer, Edit2, Trash2, ScanLine, X,
  ChevronLeft, AlertCircle, RotateCcw, CheckCircle2, Loader2,
} from 'lucide-react';

type DespachoMovement = {
  id: string;
  origen: string;
  destino: string;
  tecnologia: string;
  marca: string;
  modelo: string;
  cantidadEsperada: number;
  conduce: string;
  createdAt: Date;
};

type Props = {
  tasks: any[];
  catMarcas: any[];
  catModelos: any[];
  catTecnologias: any[];
  DESP_ORIGENES: readonly any[];
  DESP_DESTINOS: readonly any[];
  generateDespConduce: (origenId: string, destinoId: string) => string;
  despResetPistolero: () => void;
  fetchTasks: () => void;
  despFase: string;
  setDespFase: (v: 'dashboard' | 'pistolero') => void;
  despActiveMovements: any[];
  setDespActiveMovements: (updater: any) => void;
  despOrigen: string | null;
  setDespOrigen: (v: string | null) => void;
  despDestino: string | null;
  setDespDestino: (v: string | null) => void;
  despScanSN: string;
  setDespScanSN: (v: string) => void;
  despScannedItems: any[];
  setDespScannedItems: (updater: any) => void;
  despScanError: string;
  setDespScanError: (v: string) => void;
  despGuideNumber: string;
  setDespGuideNumber: (v: string) => void;
  despNotes: string;
  setDespNotes: (v: string) => void;
  despDispatching: boolean;
  setDespDispatching: (v: boolean) => void;
  despBoxModalOpen: boolean;
  setDespBoxModalOpen: (v: boolean) => void;
  despBoxTecnologia: string;
  setDespBoxTecnologia: (v: string) => void;
  despBoxMarca: string;
  setDespBoxMarca: (v: string) => void;
  despBoxModelo: string;
  setDespBoxModelo: (v: string) => void;
  despBoxCantidad: number | '';
  setDespBoxCantidad: (v: number | '') => void;
  despEditingMovementId: string | null;
  setDespEditingMovementId: (v: string | null) => void;
  despBoxNumber: string;
  setDespBoxNumber: (v: string) => void;
};

/**
 * C1: vista "Retornar a Bodega" (antes Despacho Taller) extraída del monolito y memoizada.
 * Todo el estado desp* vive en el padre; aquí se reciben valores + setters + helpers.
 */
export const DespachoView = memo(function DespachoView({
  tasks,
  catMarcas,
  catModelos,
  catTecnologias,
  DESP_ORIGENES,
  DESP_DESTINOS,
  generateDespConduce,
  despResetPistolero,
  fetchTasks,
  despFase,
  setDespFase,
  despActiveMovements,
  setDespActiveMovements,
  despOrigen,
  setDespOrigen,
  despDestino,
  setDespDestino,
  despScanSN,
  setDespScanSN,
  despScannedItems,
  setDespScannedItems,
  despScanError,
  setDespScanError,
  despGuideNumber,
  setDespGuideNumber,
  despNotes,
  setDespNotes,
  despDispatching,
  setDespDispatching,
  despBoxModalOpen,
  setDespBoxModalOpen,
  despBoxTecnologia,
  setDespBoxTecnologia,
  despBoxMarca,
  setDespBoxMarca,
  despBoxModelo,
  setDespBoxModelo,
  despBoxCantidad,
  setDespBoxCantidad,
  despEditingMovementId,
  setDespEditingMovementId,
  despBoxNumber,
  setDespBoxNumber,
}: Props) {
  const origenDef = DESP_ORIGENES.find(o => o.id === despOrigen);
  const destinoDef = DESP_DESTINOS.find(d => d.id === despDestino);
  const despTasks = origenDef ? tasks.filter(t => t.etapa === origenDef.etapa) : [];

  return (
    <div className="space-y-0">

      {/* FASE: Dashboard */}
      {despFase === 'dashboard' && (
        <div className="bg-white rounded-3xl border-2 border-slate-100 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-[#181c3a] to-indigo-900 p-8 text-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-white/15 p-3 rounded-2xl backdrop-blur-sm">
                <Send className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/60 mb-1">Taller · Producción</p>
                <h2 className="text-2xl font-black">Retornar a Bodega</h2>
                <p className="text-[11px] text-white/70 mt-0.5">Gestión de Movimientos y Cajas</p>
              </div>
            </div>
            <button
              onClick={() => {
                setDespBoxModalOpen(true);
                setDespEditingMovementId(null);
                setDespOrigen(null);
                setDespDestino(null);
                setDespBoxTecnologia('');
                setDespBoxMarca('');
                setDespBoxModelo('');
                setDespBoxCantidad('');
              }}
              className="bg-black hover:bg-slate-900 text-white font-black shadow-lg shadow-black/20 gap-2 flex items-center px-4 py-2.5 rounded-xl transition-all"
            >
              <Plus className="w-5 h-5" />
              Crear Movimiento
            </button>
          </div>

          <div className="p-8">
            {despActiveMovements.length === 0 ? (
              <div className="text-center py-16 px-4 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Package className="w-8 h-8 text-slate-300" />
                </div>
                <h3 className="text-lg font-black text-slate-800 mb-1">No hay movimientos activos</h3>
                <p className="text-sm font-bold text-slate-500">Haz clic en "Crear Movimiento" para iniciar un nuevo despacho.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {despActiveMovements.map(mov => {
                  const origenInfo = DESP_ORIGENES.find(o => o.id === mov.origen);
                  const destinoInfo = DESP_DESTINOS.find(d => d.id === mov.destino);
                  const DestIcon = destinoInfo?.icon || Package;
                  return (
                    <div
                      key={mov.id}
                      className="group text-left bg-white border-2 border-slate-100 rounded-3xl p-6 hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-500/10 transition-all flex flex-col relative"
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className={`p-3 rounded-2xl ${destinoInfo?.id === 'salida' ? 'bg-indigo-50 text-indigo-600' : 'bg-teal-50 text-teal-600'} transition-colors`}>
                          <DestIcon className="w-6 h-6" />
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant="slate" className="bg-slate-100 text-slate-600 font-black text-[9px] uppercase">
                            {mov.conduce}
                          </Badge>
                          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                            <button onClick={(e) => {
                              e.stopPropagation();
                              notify.info('Visualizar detalle - Próximamente');
                            }} className="flex items-center gap-1.5 px-2 py-1.5 text-black hover:bg-slate-100 rounded-lg transition-colors text-[10px] font-bold" title="Visualizar">
                              <Eye className="w-4 h-4" /> Ver
                            </button>
                            <button onClick={(e) => {
                              e.stopPropagation();
                              notify.info('Imprimir conduce - Próximamente');
                            }} className="flex items-center gap-1.5 px-2 py-1.5 text-black hover:bg-slate-100 rounded-lg transition-colors text-[10px] font-bold" title="Imprimir Conduce">
                              <Printer className="w-4 h-4" /> Imprimir
                            </button>
                            <button onClick={(e) => {
                              e.stopPropagation();
                              setDespEditingMovementId(mov.id);
                              setDespOrigen(mov.origen);
                              setDespDestino(mov.destino);
                              setDespBoxTecnologia(mov.tecnologia);
                              setDespBoxMarca(mov.marca);
                              setDespBoxModelo(mov.modelo);
                              setDespBoxCantidad(mov.cantidadEsperada);
                              setDespBoxModalOpen(true);
                            }} className="flex items-center gap-1.5 px-2 py-1.5 text-black hover:bg-slate-100 rounded-lg transition-colors text-[10px] font-bold" title="Editar / Actualizar">
                              <Edit2 className="w-4 h-4" /> Editar / Actualizar
                            </button>
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              if(await confirmDialog({ title: 'Eliminar movimiento', message: '¿Eliminar este movimiento?', tone: 'error', confirmText: 'Eliminar' })) {
                                setDespActiveMovements((prev: any[]) => prev.filter(m => m.id !== mov.id));
                              }
                            }} className="flex items-center gap-1.5 px-2 py-1.5 text-white bg-black hover:bg-rose-600 rounded-lg transition-colors text-[10px] font-bold ml-auto" title="Eliminar">
                              <Trash2 className="w-4 h-4" /> Eliminar
                            </button>
                          </div>
                        </div>
                      </div>
                      <h3 className="text-lg font-black text-slate-800 mb-1 truncate pr-8" title={mov.id}>{mov.id}</h3>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4">
                        {origenInfo?.label} → {destinoInfo?.label}
                      </p>
                      <div className="mt-auto pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Modelo</p>
                          <p className="text-xs font-bold text-slate-700 truncate">{mov.marca} {mov.modelo}</p>
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cantidad</p>
                          <p className="text-xs font-bold text-slate-700">{mov.cantidadEsperada} uds</p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setDespOrigen(mov.origen);
                          setDespDestino(mov.destino);
                          setDespBoxNumber(mov.id);
                          setDespGuideNumber(mov.conduce);
                          setDespFase('pistolero');
                        }}
                        className="w-full py-3 bg-[#181c3a] text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-colors flex items-center justify-center gap-2"
                      >
                        <ScanLine className="w-4 h-4" /> Abrir Escáner
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL CAJA DE SALIDA / BODEGA */}
      {despBoxModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-[#181c3a]/40 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
          <Card className="max-w-xl w-full max-h-[92dvh] shadow-2xl animate-rise-in p-0 overflow-hidden my-0 sm:my-4 rounded-t-[1.75rem] sm:rounded-3xl flex flex-col">
            <div className="p-6 bg-indigo-600 text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Package className="w-5 h-5 text-indigo-200" />
                <div>
                  <h3 className="font-black text-lg">Nuevo Movimiento</h3>
                  <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-0.5">Define los detalles del despacho</p>
                </div>
              </div>
              <button onClick={() => setDespBoxModalOpen(false)} className="text-white/60 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6 bg-slate-50">
              {/* Origen y Destino in Modal */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Origen <span className="text-rose-500">*</span></label>
                  <select value={despOrigen || ''} onChange={e => setDespOrigen(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-indigo-400 transition-all">
                    <option value="">Seleccionar Origen</option>
                    {DESP_ORIGENES.map(o => (
                      <option key={o.id} value={o.id}>{o.label} ({tasks.filter(t => t.etapa === o.etapa).length})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Destino <span className="text-rose-500">*</span></label>
                  <select value={despDestino || ''} onChange={e => setDespDestino(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-indigo-400 transition-all">
                    <option value="">Seleccionar Destino</option>
                    {DESP_DESTINOS.map(d => (
                      <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Tecnología <span className="text-rose-500">*</span></label>
                  <select value={despBoxTecnologia} onChange={e => setDespBoxTecnologia(e.target.value)} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 transition-all">
                    <option value="">Seleccionar Tecnología</option>
                    {catTecnologias.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Marca <span className="text-rose-500">*</span></label>
                  <select value={despBoxMarca} onChange={e => { setDespBoxMarca(e.target.value); setDespBoxModelo(''); }} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-indigo-400 transition-all">
                    <option value="">Seleccionar Marca</option>
                    {catMarcas.map(m => (
                      <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Modelo <span className="text-rose-500">*</span></label>
                  <select value={despBoxModelo} onChange={e => setDespBoxModelo(e.target.value)} disabled={!despBoxMarca} className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-indigo-400 transition-all disabled:opacity-50 disabled:bg-slate-100">
                    <option value="">{despBoxMarca ? 'Seleccionar Modelo' : 'Selecciona una marca primero'}</option>
                    {catModelos
                      .filter(m => !despBoxMarca || m.brand_id === catMarcas.find(b => b.name === despBoxMarca)?.id)
                      .map(m => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1">Cantidad Esperada <span className="text-rose-500">*</span></label>
                  <input type="number" min="1" value={despBoxCantidad} onChange={e => setDespBoxCantidad(e.target.value ? parseInt(e.target.value) : '')} placeholder="Cantidad de equipos" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-indigo-400 transition-all" />
                </div>
              </div>
              <Button
                variant="primary"
                disabled={!despOrigen || !despDestino || !despBoxTecnologia || !despBoxMarca || !despBoxModelo || !despBoxCantidad}
                className="w-full bg-[#181c3a] hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 text-white shadow-lg py-4 font-black mt-2 disabled:shadow-none"
                onClick={async () => {
                  if (!despOrigen || !despDestino || !despBoxTecnologia || !despBoxMarca || !despBoxModelo || !despBoxCantidad) {
                    notify.warning('Completa todos los campos para crear el lote.');
                    return;
                  }
                  let boxId = despEditingMovementId;
                  if (!boxId) {
                    if (despDestino === 'bodega') {
                      boxId = `PENDIENTE-BOD-${Date.now().toString().slice(-4)}`;
                    } else {
                      boxId = `SALIDA-${Date.now().toString().slice(-4)} OUT`;
                    }
                  }

                  const newMovement: DespachoMovement = {
                    id: boxId,
                    origen: despOrigen,
                    destino: despDestino,
                    tecnologia: despBoxTecnologia,
                    marca: despBoxMarca,
                    modelo: despBoxModelo,
                    cantidadEsperada: typeof despBoxCantidad === 'number' ? despBoxCantidad : 0,
                    conduce: despEditingMovementId ? despActiveMovements.find(m => m.id === despEditingMovementId)?.conduce || generateDespConduce(despOrigen, despDestino) : generateDespConduce(despOrigen, despDestino),
                    createdAt: despEditingMovementId ? despActiveMovements.find(m => m.id === despEditingMovementId)?.createdAt || new Date() : new Date()
                  };

                  if (despEditingMovementId) {
                    setDespActiveMovements((prev: any[]) => prev.map(m => m.id === despEditingMovementId ? newMovement : m));
                  } else {
                    setDespActiveMovements([...despActiveMovements, newMovement as any]);
                  }

                  setDespBoxModalOpen(false);
                  setDespEditingMovementId(null);
                  setDespOrigen(null);
                  setDespDestino(null);
                }}
              >
                Crear Movimiento
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* FASE 2+3: Pistolero + Conduce */}
      {despFase === 'pistolero' && origenDef && destinoDef && (
        <div className="bg-white rounded-3xl border-2 border-slate-100 shadow-sm overflow-hidden flex flex-col">
          {/* Header */}
          <div className="p-6 text-white flex items-center justify-between shrink-0 bg-gradient-to-r from-indigo-600 to-indigo-800">
            <div className="flex items-center gap-4">
              <div className="bg-white/15 p-2.5 rounded-xl">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/60">Retornar a Bodega</p>
                <h2 className="text-xl font-black">{origenDef.label}<span className="mx-2 text-white/40">→</span>{destinoDef.label}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-[10px] text-white/70">{despTasks.length} disponibles · {despScannedItems.length} seleccionado(s)</p>
                  {despBoxNumber && (
                    <Badge variant="slate" className="bg-white/20 text-white border-none font-black text-[9px] uppercase backdrop-blur-md">
                      Caja: {despBoxNumber}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
            <button onClick={() => { setDespFase('dashboard'); despResetPistolero(); }}
              className="flex items-center gap-2 text-[10px] font-black text-white uppercase tracking-widest transition-colors bg-[#181c3a] hover:bg-black px-4 py-2.5 rounded-xl shadow-lg shadow-black/20"
            >
              <ChevronLeft className="w-4 h-4" /> Regresar
            </button>
          </div>

          {/* Body 2 cols */}
          <div className="p-6 grid grid-cols-2 gap-6">
            {/* LEFT */}
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-black text-[#181c3a]">Escáner de Series</h3>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-black text-slate-700">SN <span className="text-rose-500">*</span></label>
                    <span className="text-[10px] font-bold text-slate-400">Max: 15</span>
                  </div>
                  <input
                    id="desp-sn-input" autoFocus type="text" maxLength={15}
                    value={despScanSN}
                    onChange={e => { setDespScanSN(e.target.value.toUpperCase()); setDespScanError(''); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const snVal = despScanSN.trim().toUpperCase();
                        if (!snVal) { setDespScanError('El SN es obligatorio'); return; }
                        if (despScannedItems.find(i => i.sn === snVal)) { setDespScanError(`"${snVal}" ya fue registrado`); setDespScanSN(''); return; }
                        const found = despTasks.find(t => (t.all_sns || [t.sn]).map((s: string) => s.toUpperCase()).includes(snVal));
                        if (!found) { setDespScanError(`"${snVal}" no está en ${origenDef.label} — verifica su estatus`); return; }
                        const idx = despScannedItems.length;
                        setDespScannedItems((prev: any[]) => [...prev, { num: idx+1, sn: snVal, os: found.id, marca: found.marca, modelo: found.modelo, dbId: found.dbId, all_dbIds: found.all_dbIds }]);
                        setDespScanSN(''); setDespScanError('');
                        document.getElementById('desp-sn-input')?.focus();
                      }
                    }}
                    placeholder={`Escanear SN en ${origenDef.label}...`}
                    className={`w-full px-4 py-3 border rounded-xl text-sm font-mono font-bold outline-none transition-colors ${despScanError ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white focus:border-indigo-400'}`}
                  />
                  <div className="flex justify-end mt-1">
                    <span className="text-[10px] font-bold text-slate-400">{despScanSN.length} / 15</span>
                  </div>
                </div>
                {despScanError && (
                  <p className="text-[10px] font-black text-rose-500 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />{despScanError}
                  </p>
                )}
                <button
                  onClick={() => {
                    const snVal = despScanSN.trim().toUpperCase();
                    if (!snVal) { setDespScanError('El SN es obligatorio'); return; }
                    if (despScannedItems.find(i => i.sn === snVal)) { setDespScanError(`"${snVal}" ya fue registrado`); setDespScanSN(''); return; }
                    const found = despTasks.find(t => (t.all_sns || [t.sn]).map((s: string) => s.toUpperCase()).includes(snVal));
                    if (!found) { setDespScanError(`"${snVal}" no está en ${origenDef.label}`); return; }
                    const idx = despScannedItems.length;
                    setDespScannedItems((prev: any[]) => [...prev, { num: idx+1, sn: snVal, os: found.id, marca: found.marca, modelo: found.modelo, dbId: found.dbId, all_dbIds: found.all_dbIds }]);
                    setDespScanSN(''); setDespScanError('');
                    document.getElementById('desp-sn-input')?.focus();
                  }}
                  className="w-full py-3.5 bg-[#181c3a] hover:bg-[#232848] text-white font-black text-sm rounded-xl transition-all active:scale-[0.99] tracking-wider"
                >Registrar Equipo (Enter)</button>
              </div>
              {/* Progreso */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <h3 className="text-sm font-black text-slate-500 mb-3">Progreso</h3>
                <div className="flex items-end gap-2 mb-3">
                  <span className="text-4xl font-black text-[#181c3a]">{despScannedItems.length}</span>
                  <span className="text-sm font-bold text-slate-400 mb-1">/ {despTasks.length} disponibles</span>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: despTasks.length > 0 ? `${Math.min(100,(despScannedItems.length/despTasks.length)*100)}%` : '0%', background: 'linear-gradient(90deg,#6366f1,#818cf8)' }}
                  />
                </div>
              </div>
            </div>

            {/* RIGHT: Tabla */}
            <div className="flex flex-col">
              <h3 className="text-sm font-black text-[#181c3a] mb-3">Contenido del Despacho</h3>
              <div className="flex-1 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                {despScannedItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-52 text-center">
                    <ScanLine className="w-10 h-10 text-indigo-200 mb-3" />
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Registra equipos con el escáner</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto overflow-y-auto max-h-[380px] custom-scrollbar">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                        <tr>
                          <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">#</th>
                          <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">OS</th>
                          <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">SN</th>
                          <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-widest text-slate-400">Modelo</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {[...despScannedItems].reverse().map((sc, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-3"><span className="text-[10px] font-black text-slate-400">{despScannedItems.length - i}</span></td>
                            <td className="px-3 py-3"><span className="text-[10px] font-black text-[#181c3a] bg-slate-100 px-1.5 py-0.5 rounded">{sc.os}</span></td>
                            <td className="px-3 py-3"><span className="text-xs font-black text-indigo-600 font-mono">{sc.sn}</span></td>
                            <td className="px-3 py-3"><span className="text-[10px] text-slate-500">{sc.marca} {sc.modelo}</span></td>
                            <td className="px-3 py-3">
                              <button onClick={() => setDespScannedItems((prev: any[]) => prev.filter((_, idx) => idx !== (despScannedItems.length - 1 - i)))}
                                className="text-slate-300 hover:text-rose-400 transition-colors p-1 rounded-lg hover:bg-rose-50">
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

          {/* FASE 3: Conduce + Confirmación */}
          <div className="px-6 pb-6 space-y-3 border-t border-slate-100 pt-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Conduce de Despacho <span className="text-rose-500">*</span>
                  </label>
                  <button onClick={() => setDespGuideNumber(generateDespConduce(despOrigen!, despDestino!))}
                    className="text-[9px] font-black text-indigo-500 hover:text-indigo-700 uppercase tracking-widest flex items-center gap-1 transition-colors">
                    <RotateCcw className="w-3 h-3" /> Regenerar
                  </button>
                </div>
                <div className="relative">
                  <input type="text" value={despGuideNumber} onChange={e => setDespGuideNumber(e.target.value)}
                    placeholder="CD-ORIG-DEST-2026-0000"
                    className="w-full pl-4 pr-24 py-3 bg-indigo-50 border-2 border-indigo-200 rounded-xl text-sm font-black text-indigo-700 outline-none focus:border-indigo-400 transition-colors font-mono tracking-wider"
                  />
                  {despGuideNumber && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[9px] font-black text-indigo-400">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Generado
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Notas</label>
                <textarea value={despNotes} onChange={e => setDespNotes(e.target.value)}
                  placeholder="Observaciones del despacho..." rows={2}
                  className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm text-[#181c3a] outline-none focus:border-indigo-400 transition-colors resize-none"
                />
              </div>
            </div>
            <Button
              variant="primary"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20 font-black py-4"
              rightIcon={despDispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              onClick={async () => {
                if (despScannedItems.length === 0) { notify.warning('Registra al menos un equipo antes de confirmar.'); return; }
                if (!despGuideNumber.trim()) { notify.warning('El conduce es obligatorio.'); return; }
                try {
                  setDespDispatching(true);

                  const { logAdvancedAudit } = await import('@/lib/database/audit');
                  const { updateSeriesStatus } = await import('@/lib/database/workshop');
                  const groups = despScannedItems.reduce((acc: any, curr: any) => {
                    const id = curr.dbId;
                    if (!acc[id]) acc[id] = [];
                    acc[id].push(curr);
                    return acc;
                  }, {});

                  let finalBoxNumber = despBoxNumber;
                  if (destinoDef.id === 'bodega') {
                    const supabase = getSupabaseBrowserClient();
                    if (supabase) {
                      const { data, error } = await supabase.rpc('next_box_code');
                      if (!error && data) {
                        finalBoxNumber = data;
                      } else {
                        finalBoxNumber = `CAJA-BOD-${Date.now().toString().slice(-4)}`;
                      }
                    }
                  }

                  for (const id in groups) {
                    const items = groups[id];
                    await updateSeriesStatus(id, destinoDef.status);
                    await logAdvancedAudit({ module: 'Taller', tableName: 'series', recordId: id, action: 'DESPACHO TALLER', severity: 'INFO',
                      newValues: { conduce: despGuideNumber, origen: origenDef.label, destino: destinoDef.label, notes: despNotes, serial: items[0].sn, os: items[0].os, caja: finalBoxNumber || undefined }
                    });
                  }

                  if (destinoDef.id === 'bodega' && finalBoxNumber) {
                    const { createBoxWithSeries } = await import('@/lib/database/warehouse');

                    const targetMovement = despActiveMovements.find(m => m.id === despBoxNumber);
                    const selectedMarcaId = catMarcas.find(m => m.name === targetMovement?.marca)?.id || targetMovement?.marca || '';
                    const selectedModeloId = catModelos.find(m => m.name === targetMovement?.modelo)?.id || targetMovement?.modelo || '';

                    const boxData = {
                      box_code: finalBoxNumber,
                      rack_location: 'SIN ASIGNAR',
                      brand_id: selectedMarcaId,
                      model_id: selectedModeloId,
                      capacity: targetMovement?.cantidadEsperada || despScannedItems.length,
                      status: despScannedItems.length >= (targetMovement?.cantidadEsperada || despScannedItems.length) ? 'Full' : 'Partial'
                    };

                    const snsToUpdate = new Set<string>();
                    despScannedItems.forEach(curr => {
                      const found = tasks.find(t => t.dbId === curr.dbId);
                      if (found && found.all_sns) {
                        found.all_sns.forEach((s: string) => snsToUpdate.add(s));
                      } else {
                        snsToUpdate.add(curr.sn);
                      }
                    });

                    const result = await createBoxWithSeries(boxData, Array.from(snsToUpdate));
                    if (result.error) {
                      console.error('Error al crear la caja en Bodega Central:', result.error);
                    }
                  }

                  setDespActiveMovements((prev: any[]) => prev.filter(m => m.id !== despBoxNumber));

                  notify.success('Despacho completado', { description: `Se movieron ${despScannedItems.length} equipos a ${destinoDef.label}.` });
                  setDespFase('dashboard');
                  despResetPistolero();
                  fetchTasks();
                } catch (err: any) { notify.error('Error en el despacho', { description: err.message }); }
                setDespDispatching(false);
              }}
            >
              {despDispatching ? 'Despachando...' : `Confirmar Despacho (${despScannedItems.length} equipo${despScannedItems.length !== 1 ? 's' : ''})`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
});
