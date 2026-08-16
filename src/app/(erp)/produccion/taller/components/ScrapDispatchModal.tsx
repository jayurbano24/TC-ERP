'use client';

import { memo, useMemo, useState } from 'react';
import { Button, notify } from '@/components/ui';
import {
  Package, X, BarChart3, ScanLine, Layers, Trash2,
  AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';
import {
  filterBrandsByTechnologyId,
  filterModelsByTechAndBrand,
  resolveCatalogBrandId,
  resolveCatalogTechId,
} from '@/shared/catalogs/cascadeCatalogFilters';
import {
  fetchWorkshopTasksPageViaApi,
  locateWorkshopEquipmentViaApi,
  scrapDispatchViaApi,
} from '@/lib/api/workshopTasks';

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
  generateConduceNumber: _generateConduceNumber,
  fetchTasks,
  onClose,
}: Props) {
  const scrapTechId = useMemo(
    () => resolveCatalogTechId(catTecnologias, scrapBoxTecnologia),
    [catTecnologias, scrapBoxTecnologia]
  );
  const scrapBrandOptions = useMemo(
    () => filterBrandsByTechnologyId(catMarcas, catModelos, scrapTechId),
    [catMarcas, catModelos, scrapTechId]
  );
  const scrapBrandId = useMemo(
    () => resolveCatalogBrandId(catMarcas, scrapBoxMarca),
    [catMarcas, scrapBoxMarca]
  );
  const scrapModelOptions = useMemo(
    () => filterModelsByTechAndBrand(catModelos, scrapTechId || undefined, scrapBrandId || undefined),
    [catModelos, scrapTechId, scrapBrandId]
  );
  const [scrapLookingUp, setScrapLookingUp] = useState(false);

  const matchTaskBySn = (tasks: any[], snVal: string) =>
    tasks.find((t) =>
      (t.all_sns || [t.sn]).map((s: string) => String(s || '').toUpperCase()).includes(snVal)
    );

  /** Adapta fila cruda de /workshop/tasks (cola scraps) al shape del modal. */
  const adaptScrapApiTask = (t: any) => {
    const allSns: string[] = t.all_sns?.length
      ? t.all_sns
      : [t.serial_number].filter(Boolean);
    return {
      id: t.service_orders?.os_label || t.os_label || 'S/OS',
      sn: allSns[0] || t.serial_number || 'S/N',
      all_sns: allSns,
      marca: t.brands?.name || t.brand_name || 'Desconocida',
      modelo: t.models?.name || t.model_name || 'S/N',
      dbId: t.service_order_id || t.id,
      all_dbIds: t.all_dbIds?.length ? t.all_dbIds : [t.id],
    };
  };

  const registerScan = async () => {
    const snVal = scrapScanSN.trim().toUpperCase();
    if (!snVal) {
      setScrapScanError('El SN es obligatorio');
      return;
    }
    if (scrapScannedItems.find((i: any) => String(i.sn || '').toUpperCase() === snVal)) {
      setScrapScanError(`"${snVal}" ya fue registrado en esta caja`);
      setScrapScanSN('');
      return;
    }

    let found = matchTaskBySn(filteredTasks, snVal);

    // La cola en pantalla es solo 1 página (~50). Buscar en toda la cola SCRAP (irreparable).
    if (!found) {
      setScrapLookingUp(true);
      setScrapScanError('Buscando en cola SCRAP…');
      try {
        const page = await fetchWorkshopTasksPageViaApi('scraps', null, snVal);
        const adapted = (page.items || []).map(adaptScrapApiTask);
        found = matchTaskBySn(adapted, snVal) || adapted[0] || null;

        if (!found) {
          const loc = await locateWorkshopEquipmentViaApi(snVal);
          if (loc.found && loc.tab && loc.tab !== 'scraps') {
            setScrapScanError(
              `"${snVal}" está en ${loc.tabLabel || loc.tab} (${loc.status || '—'}), no en SCRAP. Clasifíquelo a SCRAPS en Taller para despacharlo aquí.`
            );
            return;
          }
          if (loc.found && loc.outsideWorkshop) {
            setScrapScanError(
              loc.locationLabel?.includes('SCRAPS')
                ? `"${snVal}" ya está en ${loc.locationLabel}.`
                : `"${snVal}" está en ${loc.locationLabel || 'Bodega'}; no está en cola SCRAP.`
            );
            return;
          }
          setScrapScanError(
            `"${snVal}" no está en estatus SCRAP — solo se pueden despachar equipos en cola SCRAP (irreparable).`
          );
          return;
        }
      } catch (err) {
        setScrapScanError(
          err instanceof Error ? err.message : 'No se pudo validar el SN en cola SCRAP'
        );
        return;
      } finally {
        setScrapLookingUp(false);
      }
    }

    const idx = scrapScannedItems.length;
    setScrapScannedItems((prev: any[]) => [
      ...prev,
      {
        num: idx + 1,
        sn: snVal,
        os: found.id,
        marca: found.marca,
        modelo: found.modelo,
        dbId: found.dbId,
        all_dbIds: found.all_dbIds,
        usuario: 'Actual',
      },
    ]);
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
              <h2 className="text-2xl font-black text-white">Ingreso Bodega SCRAPS</h2>
              <p className="text-[11px] text-white/70 mt-0.5">
                {filteredTasks.length} equipo(s) en cola · {scrapScannedItems.length} en la caja · Nº de caja al confirmar (BOX-BAD-…)
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
                  <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-wider">Detalle de la Caja SCRAPS</h3>
                  <p className="text-[10px] text-slate-400 font-medium">
                    Secuencia propia de SCRAPS: al confirmar se asigna BOX-BAD-001… (independiente de Bodega Central)
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Tecnología primero → marca → modelo */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                    Tecnología <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={scrapBoxTecnologia}
                    onChange={e => {
                      setScrapBoxTecnologia(e.target.value);
                      setScrapBoxMarca('');
                      setScrapBoxModelo('');
                    }}
                    className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">Seleccionar tecnología...</option>
                    {catTecnologias.map((t: any) => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {/* Marca */}
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                    Marca <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={scrapBoxMarca}
                    onChange={e => { setScrapBoxMarca(e.target.value); setScrapBoxModelo(''); }}
                    disabled={!scrapBoxTecnologia}
                    className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors appearance-none cursor-pointer disabled:opacity-50"
                  >
                    <option value="">
                      {scrapBoxTecnologia ? 'Seleccionar marca...' : 'Primero selecciona una tecnología'}
                    </option>
                    {scrapBrandOptions.map((m: any) => (
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
                    {scrapModelOptions.map((m: any) => (
                      <option key={m.id} value={m.name}>{m.name}</option>
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
                  setScrapGuideNumber('');
                  setScrapBoxStep('despacho');
                  setScrapActiveView('pistolero');
                }}
                className="w-full py-4 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-black text-sm uppercase tracking-widest transition-all shadow-lg shadow-rose-500/25 flex items-center justify-center gap-3 active:scale-[0.99]"
              >
                <Layers className="w-5 h-5" />
                Continuar a escaneo
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
                    {/* Tabla agrupada — celdas planas, sin chips */}
                    <div className="overflow-hidden border border-slate-200 bg-white shadow-sm">
                      <table className="w-full text-left">
                        <thead className="bg-[#181c3a]">
                          <tr>
                            {['Marca', 'Modelo', 'Tecnología', 'Cantidad', 'Series'].map((h) => (
                              <th
                                key={h}
                                className="px-4 py-2.5 text-[9px] font-semibold tracking-widest text-white/90 uppercase"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {groupList.map((g, i) => {
                            const series = g.items.flatMap((it) => it.all_sns || [it.sn]);
                            const preview = series.slice(0, 3).join(', ');
                            const more = g.cantidad > 3 ? ` +${g.cantidad - 3}` : '';
                            return (
                              <tr key={i} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5 text-xs font-medium whitespace-nowrap text-slate-700 uppercase">
                                  {g.marca}
                                </td>
                                <td className="px-4 py-2.5 text-xs font-medium whitespace-nowrap text-slate-700 uppercase">
                                  {g.modelo}
                                </td>
                                <td className="px-4 py-2.5 text-xs font-medium whitespace-nowrap text-slate-500 uppercase">
                                  {g.tecnologia}
                                </td>
                                <td className="px-4 py-2.5 text-xs font-medium tabular-nums text-slate-700">
                                  {g.cantidad}
                                </td>
                                <td
                                  className="max-w-[220px] truncate px-4 py-2.5 font-mono text-xs font-medium text-slate-600"
                                  title={series.join(', ')}
                                >
                                  {preview}
                                  {more}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="border-t border-slate-200 bg-slate-50">
                          <tr>
                            <td
                              colSpan={3}
                              className="px-4 py-2.5 text-[10px] font-semibold tracking-widest text-slate-500 uppercase"
                            >
                              Total
                            </td>
                            <td className="px-4 py-2.5 text-xs font-semibold tabular-nums text-slate-800">
                              {filteredTasks.reduce((a, t) => a + (t.all_sns?.length || 1), 0)}
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
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (!scrapLookingUp) void registerScan();
                        }
                      }}
                      disabled={scrapLookingUp}
                      placeholder="Escanear SN (15 dig)..."
                      className={`w-full px-4 py-3 border rounded-xl text-sm font-mono font-bold outline-none transition-colors ${
                        scrapScanError && !scrapLookingUp
                          ? 'border-rose-400 bg-rose-50'
                          : 'border-slate-200 bg-white focus:border-rose-400'
                      }`}
                    />
                    <div className="flex justify-end mt-1">
                      <span className="text-[10px] font-bold text-slate-400">{scrapScanSN.length} / 15</span>
                    </div>
                  </div>

                  {/* Error / buscando */}
                  {scrapScanError && (
                    <p
                      className={`text-[10px] font-black flex items-center gap-1.5 ${
                        scrapLookingUp ? 'text-slate-500' : 'text-rose-500'
                      }`}
                    >
                      {scrapLookingUp ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5" />
                      )}
                      {scrapScanError}
                    </p>
                  )}

                  {/* Botón registrar */}
                  <button
                    type="button"
                    onClick={() => void registerScan()}
                    disabled={scrapLookingUp}
                    className="w-full py-3.5 bg-[#181c3a] hover:bg-[#232848] disabled:opacity-60 text-white font-black text-sm rounded-xl transition-all active:scale-[0.99] tracking-wider inline-flex items-center justify-center gap-2"
                  >
                    {scrapLookingUp ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Validando SCRAP…
                      </>
                    ) : (
                      'Registrar Equipo (Enter)'
                    )}
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
                <div className="flex-1 overflow-hidden border border-slate-200 bg-white shadow-sm">
                  {scrapScannedItems.length === 0 ? (
                    <div className="flex h-48 flex-col items-center justify-center text-center">
                      <ScanLine className="mb-3 h-10 w-10 text-slate-200" />
                      <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                        Registra equipos con el escáner
                      </p>
                    </div>
                  ) : (
                    <div className="custom-scrollbar max-h-[420px] overflow-x-auto overflow-y-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 z-10 border-b border-slate-700 bg-[#181c3a]">
                          <tr>
                            {['#', 'SAP', 'SN', 'Usuario', ''].map((h, hi) => (
                              <th
                                key={hi}
                                className="px-3 py-2.5 text-[9px] font-semibold tracking-widest text-white/90 uppercase"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {[...scrapScannedItems].reverse().map((sc, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="px-3 py-2.5 text-xs font-medium text-slate-400">
                                {scrapScannedItems.length - i}
                              </td>
                              <td className="px-3 py-2.5 text-xs font-medium whitespace-nowrap text-slate-700">
                                OK (SN)
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs font-medium whitespace-nowrap text-slate-700">
                                {sc.sn}
                              </td>
                              <td className="px-3 py-2.5 text-xs font-medium text-slate-600">
                                {sc.usuario || 'Actual'}
                              </td>
                              <td className="px-3 py-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setScrapScannedItems((prev: any[]) =>
                                      prev.filter((_, idx) => idx !== scrapScannedItems.length - 1 - i)
                                    )
                                  }
                                  className="rounded border border-transparent p-1 text-slate-400 transition-colors hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700"
                                  aria-label="Quitar equipo"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
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

          {/* Notas + confirmar ingreso a Bodega SCRAPS */}
          {scrapBoxStep === 'despacho' && (
            <div className="px-6 pb-6 space-y-3">
              <div className="rounded-xl border-2 border-rose-200 bg-rose-50 px-4 py-3">
                <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">
                  Captura de caja / Nº de etiqueta
                </p>
                <p className="text-sm font-black text-[#181c3a] mt-0.5">
                  Al confirmar se genera etiqueta irrepetible (BOX-BAD-001…), secuencia propia de SCRAPS
                </p>
                <p className="text-[10px] text-slate-500 mt-1 font-medium">
                  Queda en Bodega SCRAPS con inventario de series. No es un despacho de salida.
                </p>
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">
                  Referencia interna (opcional)
                </label>
                <input
                  type="text"
                  value={scrapGuideNumber}
                  onChange={e => setScrapGuideNumber(e.target.value)}
                  placeholder="Ej. lote reciclaje, orden interna…"
                  className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors"
                />
              </div>

              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Notas</label>
                <textarea
                  value={scrapNotes}
                  onChange={e => setScrapNotes(e.target.value)}
                  placeholder="Observaciones del ingreso a Bodega SCRAPS…"
                  rows={2}
                  className="w-full px-4 py-3 bg-white border-2 border-slate-200 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-rose-400 transition-colors resize-none"
                />
              </div>

              <Button
                variant="primary"
                className="w-full bg-rose-500 hover:bg-rose-600 text-white shadow-lg shadow-rose-500/20 font-black py-4"
                rightIcon={scrapDispatching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                onClick={async () => {
                  if (scrapScannedItems.length === 0) {
                    notify.warning('Escanea al menos un equipo antes de ingresar la caja.');
                    return;
                  }
                  if (!scrapBrandId || !scrapBoxModelo) {
                    notify.warning('Completa marca y modelo de la caja (paso 1).');
                    return;
                  }
                  const modelRow = scrapModelOptions.find((m: { name?: string; id?: string }) => m.name === scrapBoxModelo)
                    || catModelos.find((m: { name?: string; id?: string }) => m.name === scrapBoxModelo);
                  const modelId = modelRow?.id ? String(modelRow.id) : '';
                  if (!modelId) {
                    notify.warning('No se pudo resolver el modelo de catálogo para la caja.');
                    return;
                  }
                  const capacity =
                    typeof scrapBoxCantidad === 'number' && scrapBoxCantidad > 0
                      ? scrapBoxCantidad
                      : scrapScannedItems.length;

                  const seriesIds = [
                    ...new Set(
                      scrapScannedItems.flatMap((sc: { all_dbIds?: string[]; dbId?: string }) =>
                        (sc.all_dbIds?.length ? sc.all_dbIds : sc.dbId ? [sc.dbId] : []).filter(Boolean)
                      )
                    ),
                  ] as string[];

                  setScrapDispatching(true);
                  try {
                    const result = await scrapDispatchViaApi({
                      seriesIds,
                      brandId: scrapBrandId,
                      modelId,
                      capacity,
                      reference: scrapGuideNumber.trim() || undefined,
                      notes: scrapNotes,
                    });
                    notify.success(`Etiqueta ${result.box_code} · captura de caja SCRAPS`, {
                      description: `${result.linked} serie(s) · detalle e impresión en /bodega/scraps`,
                    });
                    onClose();
                    fetchTasks();
                  } catch (err: unknown) {
                    notify.error('No se pudo ingresar la caja SCRAPS', {
                      description: err instanceof Error ? err.message : 'Error desconocido',
                    });
                  }
                  setScrapDispatching(false);
                }}
              >
                {scrapDispatching
                  ? 'Ingresando a Bodega SCRAPS…'
                  : `Confirmar ingreso (${scrapScannedItems.length})`}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
