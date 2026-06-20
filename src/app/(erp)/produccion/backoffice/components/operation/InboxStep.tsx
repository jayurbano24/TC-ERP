'use client';

import React from 'react';
import { Badge, Button } from '@/components/ui';
import { RecordListCard } from '@/components/ui/RecordListCard';
import { ErpIcon } from '@/lib/design/icons';
import { erpTypography } from '@/lib/design/tokens';
import { formatDisplayDateTime } from '@/lib/formatDisplayDate';
import type { OperationContext } from '../../operation/operationContext';

type Props = { ctx: OperationContext };

export function InboxStep({ ctx }: Props) {
  const {
    inboxSearch,
    setInboxSearch,
    pendingReceptions,
    loading,
    inboxLoadError,
    handlePrintConduce,
    fetchPending,
    fetchHistory,
    handleTestConnection,
    startProcessingReception,
    historyLoading,
  } = ctx;

  const filteredReceptions = pendingReceptions.filter(
    (rec) =>
      rec.status !== 'ARCHIVADO' &&
      rec.status !== 'RECIBIDO' &&
      (!inboxSearch || rec.guide_number.toLowerCase().includes(inboxSearch.toLowerCase()))
  );

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
        <div>
          <h2 className={erpTypography.sectionTitle}>Bandeja de Entrada (CAC)</h2>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mt-2">
            Recepciones pendientes de validación administrativa
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            className="font-black text-[10px] uppercase border-amber-200 text-amber-700 hover:bg-amber-50"
          >
            <ErpIcon name="warning" className="mr-2" /> Test conexión
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchPending();
              fetchHistory();
            }}
            className="font-black text-[10px] uppercase"
          >
            <ErpIcon
              name="refresh"
              className={`mr-2 ${loading || historyLoading ? 'animate-spin' : ''}`}
            />{' '}
            Refrescar
          </Button>
        </div>
      </div>

      <div className="relative max-w-xl">
        <ErpIcon
          name="search"
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"
        />
        <input
          type="search"
          placeholder="Escanea o escribe el número de guía..."
          className="w-full bg-white border-2 border-slate-100 rounded-2xl py-3.5 sm:py-4 pl-12 pr-4 text-sm font-bold text-[#181c3a] outline-none focus:border-[#2ec4f1] transition-colors placeholder:text-slate-300"
          value={inboxSearch}
          onChange={(e) => setInboxSearch(e.target.value)}
          autoFocus
        />
      </div>

      {inboxLoadError && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div>
            <p className={erpTypography.label}>Error al cargar la bandeja</p>
            <p className="text-xs font-bold text-amber-700 mt-1">{inboxLoadError}</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchPending()}
            className="font-black text-[10px] uppercase border-amber-300 text-amber-800 hover:bg-amber-100 shrink-0"
          >
            <ErpIcon name="refresh" className="mr-2" /> Reintentar
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {loading && pendingReceptions.length === 0 && !inboxLoadError && (
          <div className="py-20 text-center bg-white rounded-2xl border border-slate-100">
            <ErpIcon name="refresh" className="w-10 h-10 mx-auto mb-4 text-[#2ec4f1] animate-spin" />
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Cargando bandeja...</p>
          </div>
        )}

        {filteredReceptions.map((rec) => {
          const isReverted = rec.status === 'PENDIENTE_BACKOFFICE';
          return (
            <RecordListCard
              key={rec.id}
              accent={isReverted ? 'warning' : 'default'}
              highlight={isReverted}
              meta={
                <>
                  <div className="flex justify-between items-start gap-2 mb-3">
                    <Badge variant={isReverted ? 'red' : 'blue'}>
                      {isReverted ? 'Revertido' : rec.status}
                    </Badge>
                    <ErpIcon name="box" className="w-5 h-5 text-slate-300" />
                  </div>
                  <h4 className="text-lg font-black font-mono text-[#181c3a] break-all">{rec.guide_number}</h4>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                    Lote: {rec.id.substring(0, 8)}
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <ErpIcon name="history" className="w-3.5 h-3.5 text-[#2ec4f1]" />
                    <span className="text-[10px] font-bold text-slate-500">
                      {formatDisplayDateTime(rec.created_at)}
                    </span>
                  </div>
                </>
              }
              footer={
                <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                  <div className="flex flex-wrap gap-4">
                    <button
                      type="button"
                      onClick={() => handlePrintConduce(rec)}
                      className="inline-flex items-center gap-1.5 text-[10px] font-black text-slate-500 hover:text-[#181c3a] uppercase tracking-widest"
                    >
                      <ErpIcon name="print" /> Imprimir conduce
                    </button>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => startProcessingReception(rec)}
                    className="font-black text-[10px] uppercase tracking-widest w-full sm:w-auto"
                  >
                    Procesar e ingresar
                  </Button>
                </div>
              }
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className={erpTypography.label}>Transportista</p>
                  <p className="text-sm font-black text-[#181c3a] leading-tight mt-1">{rec.carrier || '---'}</p>
                  <p className="text-[10px] font-bold text-[#2ec4f1] uppercase mt-1">
                    Recibido por: {rec.received_by || 'SISTEMA'}
                  </p>
                </div>
                <div>
                  <p className={erpTypography.label}>Unidades</p>
                  <p className="text-sm font-black text-[#181c3a] leading-tight mt-1">
                    {rec.received_units} bultos
                  </p>
                </div>
                <div>
                  <p className={erpTypography.label}>Ubicación actual</p>
                  <p className="text-sm font-black text-emerald-600 uppercase leading-tight mt-1">
                    Muelle de carga
                  </p>
                </div>
              </div>
            </RecordListCard>
          );
        })}

        {filteredReceptions.length === 0 && !loading && !inboxLoadError && (
          <div className="py-20 text-center bg-white rounded-2xl border-2 border-dashed border-slate-100">
            <ErpIcon name="box" className="w-14 h-14 mx-auto mb-4 text-slate-200" />
            <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
              No hay recepciones pendientes en la bandeja
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
