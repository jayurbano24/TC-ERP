'use client';

import React, { useMemo, useState } from 'react';
import { Badge, Button } from '@/components/ui';
import { Box, CheckCircle2, ChevronLeft, Monitor, Package, Radio, RefreshCw, Search } from 'lucide-react';
import {
  countClassificationProgress,
  getPendingGuides,
  isGuideProcessed,
  normalizeGuideKey,
} from '../../operation/classificationGuideUtils';
import { parseReceptionGuideList } from '../../operation/parseReceptionGuideList';
import type { OperationContext } from '../../operation/operationContext';

type Props = { ctx: OperationContext };

export function ClassificationStep({ ctx }: Props) {
  const {
    setReceptionStep,
    activeReception,
    setScannedGuides,
    processedGuides,
    classificationSearch,
    setClassificationSearch,
    setAgencia,
    setSelectedAgencyId,
    setCategory,
    initSapGroupsForConfig,
    handleUndoClassification,
    loading,
    allReceptions,
    fetchPending,
    setActiveReception,
  } = ctx;

  const [selectedGuides, setSelectedGuides] = useState<string[]>([]);

  const guiasList = useMemo(
    () => (activeReception ? parseReceptionGuideList(activeReception) : []),
    [activeReception]
  );

  const { pending, total } = useMemo(
    () =>
      activeReception
        ? countClassificationProgress(activeReception, processedGuides, allReceptions as any[])
        : { pending: 0, total: 0 },
    [activeReception, processedGuides, allReceptions]
  );

  const visiblePendingGuides = useMemo(() => {
    const pendingGuides = activeReception
      ? getPendingGuides(activeReception, processedGuides, allReceptions as any[])
      : [];
    const q = classificationSearch.trim().toLowerCase();
    if (!q) return pendingGuides;
    return pendingGuides.filter((g) => g.toLowerCase().includes(q));
  }, [activeReception, processedGuides, allReceptions, classificationSearch]);

  const toggleGuide = (guia: string) => {
    setSelectedGuides((prev) => {
      const key = normalizeGuideKey(guia);
      const exists = prev.some((g) => normalizeGuideKey(g) === key);
      if (exists) return prev.filter((g) => normalizeGuideKey(g) !== key);
      return [...prev, guia];
    });
  };

  const toggleSelectAllVisible = () => {
    if (selectedGuides.length === visiblePendingGuides.length) {
      setSelectedGuides([]);
    } else {
      setSelectedGuides([...visiblePendingGuides]);
    }
  };

  const startBulkClassification = (
    cat: 'Accesorio' | 'Teléfono' | 'Devolución',
    step: 'accessories_photos' | 'sub_bodega_transfer' | 'return_confirmation'
  ) => {
    if (selectedGuides.length === 0) return;
    setCategory(cat as any);
    setScannedGuides([...selectedGuides]);
    setAgencia('');
    setSelectedAgencyId('');
    setSelectedGuides([]);
    setReceptionStep(step as any);
  };

  const startSingleEquipo = (guia: string) => {
    setCategory('Equipo');
    setScannedGuides([guia]);
    setSelectedGuides([]);
    initSapGroupsForConfig();
    setReceptionStep('config');
  };

  const startSingleNonEquipo = (
    guia: string,
    cat: 'Accesorio' | 'Teléfono' | 'Devolución',
    step: 'accessories_photos' | 'sub_bodega_transfer' | 'return_confirmation'
  ) => {
    setCategory(cat as any);
    setScannedGuides([guia]);
    setAgencia('');
    setSelectedAgencyId('');
    setSelectedGuides([]);
    setReceptionStep(step as any);
  };

  const goBackToInbox = () => {
    setSelectedGuides([]);
    setClassificationSearch('');
    setActiveReception(null);
    setReceptionStep('category_selection');
    void fetchPending();
  };

  if (!activeReception) return null;

  const classifiedCount = total - pending;

  return (
    <div className="space-y-4 animate-rise-in">
      <div className="flex justify-between items-center">
        <button
          type="button"
          onClick={goBackToInbox}
          className="flex items-center gap-2 text-[10px] font-black text-slate-400 hover:text-[#181c3a] uppercase tracking-widest transition-all"
        >
          <ChevronLeft size={16} /> Volver a Bandeja
        </button>
        <div className="text-right">
          <Badge className="bg-[#2ec4f1] text-[#181c3a] border-none font-black text-[9px] uppercase tracking-widest">
            {String(activeReception.status)}
          </Badge>
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">
            Lote: {String(activeReception.guide_number || '').split(' ')[0]}
          </p>
        </div>
      </div>

      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-lg border border-slate-100">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-5">
          <div>
            <h2 className="text-xl font-black text-[#181c3a] uppercase leading-none">Clasificación de Carga</h2>
            <p className="text-slate-400 font-bold uppercase text-[9px] tracking-[0.15em] mt-2">
              Seleccione una o varias guías · Equipos solo individual
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Pendientes</p>
              <p className="text-2xl font-black text-[#181c3a] leading-none">
                {pending}
                <span className="text-sm text-slate-400 font-bold"> de {total}</span>
              </p>
            </div>
            {classifiedCount > 0 && (
              <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[10px] px-3 py-2">
                {classifiedCount} clasificada{classifiedCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {pending === 0 ? (
          <div className="py-16 text-center border-2 border-dashed border-emerald-200 rounded-xl bg-emerald-50/50">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h3 className="text-lg font-black text-[#181c3a] uppercase mb-2">Lote completado</h3>
            <p className="text-xs font-bold text-slate-500 mb-6">
              Las {total} guías fueron clasificadas. Este lote ya no aparecerá en la bandeja.
            </p>
            <Button variant="primary" className="bg-[#181c3a]" onClick={goBackToInbox}>
              Volver a Bandeja
            </Button>
          </div>
        ) : (
          <>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar número de guía..."
                value={classificationSearch}
                onChange={(e) => setClassificationSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:border-[#2ec4f1] transition-all placeholder:text-slate-300"
              />
            </div>

            {selectedGuides.length > 0 && (
              <div className="mb-4 p-3 bg-[#181c3a] rounded-xl flex flex-wrap items-center gap-2 justify-between">
                <span className="text-white text-[10px] font-black uppercase tracking-widest ml-1">
                  {selectedGuides.length} guía{selectedGuides.length !== 1 ? 's' : ''} seleccionada
                  {selectedGuides.length !== 1 ? 's' : ''}
                </span>
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => startBulkClassification('Accesorio', 'accessories_photos')}
                    className="bg-emerald-500 hover:bg-emerald-600 text-white border-none rounded-lg px-4 py-2 h-9 font-black text-[9px] uppercase"
                  >
                    <Package size={14} className="mr-1.5" /> Accesorios
                  </Button>
                  <Button
                    onClick={() => startBulkClassification('Teléfono', 'sub_bodega_transfer')}
                    className="bg-amber-500 hover:bg-amber-600 text-white border-none rounded-lg px-4 py-2 h-9 font-black text-[9px] uppercase"
                  >
                    <Radio size={14} className="mr-1.5" /> Teléfonos
                  </Button>
                  <Button
                    onClick={() => startBulkClassification('Devolución', 'return_confirmation')}
                    className="bg-rose-500 hover:bg-rose-600 text-white border-none rounded-lg px-4 py-2 h-9 font-black text-[9px] uppercase"
                  >
                    <RefreshCw size={14} className="mr-1.5" /> Devoluciones
                  </Button>
                  <button
                    type="button"
                    onClick={() => setSelectedGuides([])}
                    className="text-white/60 hover:text-white text-[9px] font-black uppercase px-2"
                  >
                    Limpiar
                  </button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3 px-3 py-2 mb-2 border-b border-slate-100">
              <input
                type="checkbox"
                checked={
                  visiblePendingGuides.length > 0 &&
                  selectedGuides.length === visiblePendingGuides.length
                }
                onChange={toggleSelectAllVisible}
                className="w-4 h-4 accent-[#2ec4f1] rounded cursor-pointer"
              />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                Seleccionar visibles ({visiblePendingGuides.length})
              </span>
            </div>

            <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
              {visiblePendingGuides.length === 0 ? (
                <p className="text-center py-10 text-xs font-bold uppercase text-slate-400 tracking-widest">
                  Sin coincidencias para la búsqueda
                </p>
              ) : (
                visiblePendingGuides.map((guia) => {
                  const isSelected = selectedGuides.some(
                    (g) => normalizeGuideKey(g) === normalizeGuideKey(guia)
                  );
                  const showRowActions = selectedGuides.length === 0;

                  return (
                    <div
                      key={guia}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-[#2ec4f1] bg-[#2ec4f1]/5'
                          : 'border-slate-100 bg-slate-50/80 hover:border-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleGuide(guia)}
                        className="w-4 h-4 accent-[#2ec4f1] rounded cursor-pointer shrink-0"
                      />
                      <div className="w-9 h-9 rounded-lg bg-white border border-slate-100 flex items-center justify-center shrink-0">
                        <Box size={16} className="text-[#181c3a]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                          No. de Guía / Caja
                        </p>
                        <p className="text-sm font-black font-mono text-[#181c3a] truncate">{guia}</p>
                      </div>

                      {showRowActions ? (
                        <div className="flex flex-wrap gap-1.5 justify-end shrink-0">
                          <Button
                            onClick={() => startSingleEquipo(guia)}
                            className="bg-[#181c3a] hover:bg-[#2ec4f1] text-white border-none rounded-lg px-3 py-2 h-8 font-black text-[8px] uppercase"
                          >
                            <Monitor size={12} className="mr-1" /> Equipos
                          </Button>
                          <Button
                            onClick={() => startSingleNonEquipo(guia, 'Accesorio', 'accessories_photos')}
                            className="bg-emerald-500 hover:bg-emerald-600 text-white border-none rounded-lg px-3 py-2 h-8 font-black text-[8px] uppercase"
                          >
                            <Package size={12} className="mr-1" /> Acc.
                          </Button>
                          <Button
                            onClick={() => startSingleNonEquipo(guia, 'Teléfono', 'sub_bodega_transfer')}
                            className="bg-amber-500 hover:bg-amber-600 text-white border-none rounded-lg px-3 py-2 h-8 font-black text-[8px] uppercase"
                          >
                            <Radio size={12} className="mr-1" /> Tel.
                          </Button>
                          <Button
                            onClick={() => startSingleNonEquipo(guia, 'Devolución', 'return_confirmation')}
                            className="bg-rose-500 hover:bg-rose-600 text-white border-none rounded-lg px-3 py-2 h-8 font-black text-[8px] uppercase"
                          >
                            <RefreshCw size={12} className="mr-1" /> Dev.
                          </Button>
                        </div>
                      ) : (
                        <div className="shrink-0">
                          <Button
                            onClick={() => startSingleEquipo(guia)}
                            className="bg-[#181c3a] hover:bg-[#2ec4f1] text-white border-none rounded-lg px-3 py-2 h-8 font-black text-[8px] uppercase"
                            title="Equipos solo se clasifican de a una guía"
                          >
                            <Monitor size={12} className="mr-1" /> Equipos
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {guiasList.some((g) => isGuideProcessed(g, processedGuides, allReceptions as any[])) && (
              <p className="mt-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">
                Las guías ya clasificadas no se muestran en esta lista
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
