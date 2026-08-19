'use client';

import React, { useMemo, useState } from 'react';
import { Badge, Button, notify } from '@/components/ui';
import { Box, ChevronLeft, Monitor, Package, Radio, RefreshCw } from 'lucide-react';
import { useAuthzOptional } from '@/components/authz';
import {
  canClassifyToAccesorios,
  canClassifyToTelefonos,
} from '../../operation/canClassifyAccesorios';
import { parseReceptionGuideList } from '../../operation/parseReceptionGuideList';
import type { OperationContext } from '../../operation/operationContext';
import type { OperationCategory } from '../../types';

type Props = { ctx: OperationContext };

function startBulkClassify(
  ctx: OperationContext,
  guides: string[],
  category: OperationCategory
) {
  ctx.setCategory(category);
  ctx.setScannedGuides(guides);
  ctx.setAgencia('');
  ctx.setSelectedAgencyId('');
  ctx.setReturnReason('');
  ctx.setReturnTracking('');
  ctx.setReturnCourier('');
  ctx.setAccessoryPhotos([]);
  ctx.setReceptionStep('bulk_classify_confirm');
  // Devolución: agencia destino es obligatoria — abrir selector de inmediato.
  if (category === 'Devolución') {
    ctx.setShowAgencyModal(true);
  }
}

export function ClassificationStep({ ctx }: Props) {
  const authz = useAuthzOptional();
  const authzOpts = { roleLabel: authz?.roleLabel, isAdmin: authz?.isAdmin };
  const allowAccesorios = canClassifyToAccesorios(authzOpts);
  const allowTelefonos = canClassifyToTelefonos(authzOpts);
  const {
    activeReception,
    setReceptionStep,
    setClassificationSearch,
    classificationSearch,
    processedGuides,
    allReceptions,
    setCategory,
    setScannedGuides,
    setAgencia,
    setSelectedAgencyId,
    setReturnReason,
    setReturnTracking,
    setReturnCourier,
    setAccessoryPhotos,
    initSapGroupsForConfig,
  } = ctx;

  const [selectedGuides, setSelectedGuides] = useState<string[]>([]);

  const { pendingGuides, pendingCount } = useMemo(() => {
    if (!activeReception) return { pendingGuides: [] as string[], pendingCount: 0 };
    const guiasList = parseReceptionGuideList(activeReception);
    const pending = guiasList.filter((guia) => {
      const isProcessedLocally = processedGuides.includes(guia);
      const isProcessedGlobally = allReceptions.some(
        (r) =>
          r.status === 'RECIBIDO_BACKOFFICE' &&
          (r.guide_number === guia || String(r.notes || '').toLowerCase().includes(guia.toLowerCase()))
      );
      return !isProcessedLocally && !isProcessedGlobally;
    });
    return { pendingGuides: pending, pendingCount: pending.length };
  }, [activeReception, processedGuides, allReceptions]);

  const filteredGuides = useMemo(() => {
    const q = classificationSearch.trim().toLowerCase();
    if (!q) return pendingGuides;
    return pendingGuides.filter((g) => g.toLowerCase().includes(q));
  }, [pendingGuides, classificationSearch]);

  const allFilteredSelected =
    filteredGuides.length > 0 && filteredGuides.every((g) => selectedGuides.includes(g));

  const toggleGuide = (guia: string) => {
    setSelectedGuides((prev) =>
      prev.includes(guia) ? prev.filter((g) => g !== guia) : [...prev, guia]
    );
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedGuides((prev) => prev.filter((g) => !filteredGuides.includes(g)));
    } else {
      setSelectedGuides((prev) => Array.from(new Set([...prev, ...filteredGuides])));
    }
  };

  const bulkClassify = (category: OperationCategory) => {
    if (selectedGuides.length === 0) return;
    if (category === 'Accesorio' && !allowAccesorios) {
      notify.warning('Sin permiso', {
        description: 'Solo el perfil SUPERVISOR STB puede clasificar hacia Accesorios.',
      });
      return;
    }
    if (category === 'Teléfono' && !allowTelefonos) {
      notify.warning('Sin permiso', {
        description: 'Backoffice solo puede clasificar CARGA como Equipos o Devolución.',
      });
      return;
    }
    startBulkClassify(ctx, selectedGuides, category);
    setSelectedGuides([]);
  };

  if (!activeReception) return null;

  const totalGuides = parseReceptionGuideList(activeReception).length;

  return (
    <div className="space-y-4 animate-rise-in">
      <div className="flex justify-between items-center">
        <button
          onClick={() => {
            setReceptionStep('category_selection');
            setClassificationSearch('');
            setSelectedGuides([]);
          }}
          className="flex items-center gap-2 text-[10px] font-black text-[var(--muted)] hover:text-[var(--foreground)] uppercase tracking-widest transition-all"
        >
          <ChevronLeft size={16} /> Volver a Bandeja
        </button>
        <div className="text-right">
          <Badge className="bg-[var(--accent)] text-[var(--heading)] border-none font-black text-[9px] uppercase tracking-widest">
            {String(activeReception.status)}
          </Badge>
          <p className="text-[10px] font-bold text-[var(--muted)] mt-1 uppercase">
            Lote: {String(activeReception.guide_number || '').split(' ')[0]}
          </p>
        </div>
      </div>

      <div className="erp-themed-surface p-5 rounded-2xl shadow-lg border border-[var(--border)]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-xl font-black text-[var(--heading)] uppercase">Clasificación de Carga</h2>
            <p className="text-[var(--muted)] font-bold uppercase text-[9px] tracking-widest">
              Seleccione cajas para clasificación masiva o use Equipos por caja
            </p>
          </div>
          <Badge className="bg-[var(--surface-hover)] text-[var(--foreground)] font-black text-[10px] px-3 py-1.5 border border-[var(--border)] self-start">
            {pendingCount} de {totalGuides} pendientes
          </Badge>
        </div>

        <div className="relative mb-3">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Buscar número de guía..."
            value={classificationSearch}
            onChange={(e) => setClassificationSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-[var(--accent)] transition-all placeholder:text-slate-300"
          />
          {classificationSearch && (
            <button
              onClick={() => setClassificationSearch('')}
              className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {selectedGuides.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-3 p-2.5 bg-[var(--heading)]/5 rounded-xl border border-[var(--heading)]/10">
            <span className="text-[10px] font-black text-[var(--heading)] uppercase mr-1">
              {selectedGuides.length} seleccionada{selectedGuides.length !== 1 ? 's' : ''}:
            </span>
            {allowAccesorios && (
              <Button
                onClick={() => bulkClassify('Accesorio')}
                className="h-8 px-3 bg-emerald-500 hover:bg-emerald-600 text-white border-none rounded-lg font-black text-[9px] uppercase"
              >
                <Package size={12} className="mr-1.5" /> Accesorios
              </Button>
            )}
            {allowTelefonos && (
              <Button
                onClick={() => bulkClassify('Teléfono')}
                className="h-8 px-3 bg-amber-500 hover:bg-amber-600 text-white border-none rounded-lg font-black text-[9px] uppercase"
              >
                <Radio size={12} className="mr-1.5" /> Teléfonos
              </Button>
            )}
            <Button
              onClick={() => bulkClassify('Devolución')}
              className="h-8 px-3 bg-rose-500 hover:bg-rose-600 text-white border-none rounded-lg font-black text-[9px] uppercase"
            >
              <RefreshCw size={12} className="mr-1.5" /> Devolución
            </Button>
            <button
              onClick={() => setSelectedGuides([])}
              className="ml-auto text-[9px] font-black text-slate-400 hover:text-slate-600 uppercase"
            >
              Limpiar
            </button>
          </div>
        )}

        {filteredGuides.length > 0 && (
          <label className="flex items-center gap-2 mb-2 px-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allFilteredSelected}
              onChange={toggleSelectAll}
              className="w-3.5 h-3.5 rounded border-slate-300 text-[var(--accent)] focus:ring-[var(--accent)]"
            />
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
              Seleccionar todas ({filteredGuides.length})
            </span>
          </label>
        )}

        <div className="space-y-1.5 max-h-[calc(100vh-320px)] overflow-y-auto">
          {filteredGuides.length === 0 ? (
            <p className="text-center text-xs font-bold text-slate-400 py-8 uppercase">
              {pendingCount === 0 ? 'Todas las cajas fueron procesadas' : 'Sin resultados para la búsqueda'}
            </p>
          ) : (
            filteredGuides.map((guia) => {
              const isSelected = selectedGuides.includes(guia);
              return (
                <div
                  key={guia}
                  className={`flex items-center gap-2 p-2 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-[var(--accent)]/5 border-[var(--accent)]/40'
                      : 'bg-slate-50 border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleGuide(guia)}
                    className="w-3.5 h-3.5 shrink-0 rounded border-slate-300 text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                  <div className="w-8 h-8 shrink-0 rounded-lg bg-white flex items-center justify-center text-[var(--heading)] border border-slate-100">
                    <Box size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">
                      No. Guía / Caja
                    </p>
                    <p className="text-sm font-black font-mono text-[var(--heading)] truncate">{guia}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      onClick={() => {
                        setCategory('Equipo');
                        setScannedGuides([guia]);
                        initSapGroupsForConfig();
                        setReceptionStep('config');
                      }}
                      title="Equipos (individual)"
                      className="h-8 px-2.5 bg-[var(--heading)] hover:bg-[var(--accent)] text-white border-none rounded-lg font-black text-[8px] uppercase"
                    >
                      <Monitor size={12} className="mr-1" /> Equipos
                    </Button>
                    {allowAccesorios && (
                      <Button
                        onClick={() => startBulkClassify(ctx, [guia], 'Accesorio')}
                        title="Accesorios"
                        className="h-8 px-2 bg-emerald-500 hover:bg-emerald-600 text-white border-none rounded-lg font-black text-[8px] uppercase"
                      >
                        <Package size={12} />
                      </Button>
                    )}
                    {allowTelefonos && (
                      <Button
                        onClick={() => startBulkClassify(ctx, [guia], 'Teléfono')}
                        title="Teléfonos"
                        className="h-8 px-2 bg-amber-500 hover:bg-amber-600 text-white border-none rounded-lg font-black text-[8px] uppercase"
                      >
                        <Radio size={12} />
                      </Button>
                    )}
                    <Button
                      onClick={() => startBulkClassify(ctx, [guia], 'Devolución')}
                      title="Devolución"
                      className="h-8 px-2 bg-rose-500 hover:bg-rose-600 text-white border-none rounded-lg font-black text-[8px] uppercase"
                    >
                      <RefreshCw size={12} />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
