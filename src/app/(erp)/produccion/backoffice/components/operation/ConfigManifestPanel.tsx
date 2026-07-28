'use client';

import React from 'react';
import { Button, Card } from '@/components/ui';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { summarizeSapGroupGuideItems } from '../../backofficeHelpers';
import type { OperationContext } from '../../operation/operationContext';

type Props = { ctx: OperationContext };

export function ConfigManifestPanel({ ctx }: Props) {
  const {
    setManifestPanelOpen,
    agencyDetails,
    sapGroups,
    activeSapGroupId,
    sapTransferNumber,
    guideItems,
    newItem,
    setNewItem,
    availableBrandsConfig,
    availableModels,
    isActiveSapDocumentFilled,
    MASTER_TECNOLOGIAS,
    addSapGroup,
    selectSapGroup,
    removeSapGroup,
    updateActiveSapDocument,
    addItem,
  } = ctx;

  return (
    <Card className="xl:col-span-4 p-5 border-none shadow-2xl rounded-[2rem] bg-white sticky top-8 order-2 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <div className="flex items-center justify-between gap-2 mb-4 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 bg-[var(--heading)] text-white rounded-lg flex items-center justify-center font-black text-[10px] shrink-0">1</div>
          <h3 className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400 truncate">Definición de Manifiesto</h3>
        </div>
        <button
          type="button"
          onClick={() => setManifestPanelOpen(false)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-[var(--heading)] hover:bg-slate-100 shrink-0"
          title="Ocultar panel"
        >
          <ChevronRight size={16} />
        </button>
      </div>
          
      <div className={`space-y-3 transition-all ${!agencyDetails ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <label className="text-[8px] font-black uppercase text-slate-400">Documentos SAP</label>
          <button
            type="button"
            onClick={addSapGroup}
            disabled={!agencyDetails}
            className="flex items-center gap-1 px-2 py-1 bg-[var(--accent)] text-[var(--heading)] rounded-lg text-[7px] font-black uppercase hover:bg-[var(--heading)] hover:text-white transition-all disabled:opacity-40"
          >
            <Plus size={10} /> Nuevo
          </button>
        </div>
          
        <div className="flex flex-wrap gap-1.5">
          {sapGroups.map((g, gi) => {
            const isActive = activeSapGroupId === g.id;
            const docLabel = g.sapDocument.trim() || `Doc. ${gi + 1}`;
            return (
              <div
                key={g.id}
                className={`inline-flex items-center gap-0.5 rounded-lg border pl-2 pr-0.5 py-1 ${
                  isActive ? 'border-[var(--heading)] bg-[var(--heading)] text-white' : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <button type="button" onClick={() => selectSapGroup(g.id)} className="text-[8px] font-black uppercase max-w-[90px] truncate">
                  {docLabel}
                </button>
                {sapGroups.length > 1 && (
                  <button type="button" onClick={() => removeSapGroup(g.id)} className={`p-0.5 rounded ${isActive ? 'text-white/70' : 'text-slate-400 hover:text-rose-500'}`}>
                    <Trash2 size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
          
        <div>
          <label className="text-[8px] font-black uppercase text-slate-400 mb-1 block">No. Documento SAP</label>
          <input
            type="text"
            className={`w-full px-3 py-2.5 bg-white border rounded-xl font-black text-[10px] text-[var(--heading)] outline-none focus:border-[var(--accent)] ${
              isActiveSapDocumentFilled ? 'border-slate-200' : 'border-amber-300'
            }`}
            value={sapTransferNumber}
            onChange={(e) => updateActiveSapDocument(e.target.value)}
            placeholder="SAP-0001... (requerido)"
            disabled={!agencyDetails || !activeSapGroupId}
            required
          />
          {!isActiveSapDocumentFilled && agencyDetails && (
            <p className="text-[7px] font-bold uppercase tracking-widest text-amber-600 mt-1">
              Obligatorio para habilitar Agregar
            </p>
          )}
        </div>
          
        {activeSapGroupId && (() => {
          const summary = summarizeSapGroupGuideItems(activeSapGroupId, guideItems, MASTER_TECNOLOGIAS);
          if (summary.itemCount === 0) return null;
          return (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[7px] font-black uppercase tracking-widest text-slate-500 space-y-0.5">
              {summary.techLines.map((line) => (
                <div key={line.name} className="flex justify-between">
                  <span>{line.name}</span><span>{line.units} eq.</span>
                </div>
              ))}
              <div className="flex justify-between text-[var(--heading)] pt-1 border-t border-slate-200">
                <span>Total</span><span>{summary.totalUnits} eq.</span>
              </div>
            </div>
          );
        })()}
          
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="col-span-2">
            <label className="text-[8px] font-black uppercase text-slate-400 mb-1 block">Tecnología</label>
            <select
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-[10px] text-[var(--heading)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
              value={newItem.tipo}
              onChange={(e) => setNewItem({ ...newItem, tipo: e.target.value, marca: '', modelo: '' })}
              disabled={!agencyDetails}
            >
              <option value="">Tecnología...</option>
              {MASTER_TECNOLOGIAS.map((t) => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[8px] font-black uppercase text-slate-400 mb-1 block">Marca</label>
            <select
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-[10px] text-[var(--heading)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
              value={newItem.marca}
              onChange={(e) => setNewItem({ ...newItem, marca: e.target.value, modelo: '' })}
              disabled={!agencyDetails || !newItem.tipo}
            >
              <option value="">{newItem.tipo ? 'Marca...' : 'Tecnología primero'}</option>
              {availableBrandsConfig.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[8px] font-black uppercase text-slate-400 mb-1 block">Modelo</label>
            <select
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-[10px] text-[var(--heading)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
              value={newItem.modelo}
              onChange={(e) => setNewItem({ ...newItem, modelo: e.target.value })}
              disabled={!agencyDetails || !newItem.marca || !newItem.tipo}
            >
              <option value="">{newItem.marca ? 'Modelo...' : 'Marca primero'}</option>
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>{m.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[8px] font-black uppercase text-slate-400 mb-1 block">Cant.</label>
            <input
              type="number"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-black text-[10px] text-[var(--heading)] outline-none focus:border-[var(--accent)] disabled:opacity-50"
              value={newItem.cantidad || ''}
              onChange={(e) => setNewItem({ ...newItem, cantidad: parseInt(e.target.value) || 0 })}
              placeholder="0"
              disabled={!agencyDetails}
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={addItem}
              disabled={!agencyDetails || !isActiveSapDocumentFilled}
              className={`w-full h-10 rounded-xl font-black uppercase text-[8px] gap-1 ${
                !agencyDetails || !isActiveSapDocumentFilled
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-[var(--heading)] hover:bg-[var(--accent)] text-white'
              }`}
              title={!isActiveSapDocumentFilled ? 'Ingrese el No. Documento SAP primero' : undefined}
            >
              <Plus size={14} /> Agregar
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
