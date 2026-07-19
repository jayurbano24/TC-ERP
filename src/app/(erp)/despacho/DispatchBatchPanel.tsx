"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, notify, confirmDialog } from '@/components/ui';
import { Boxes, Plus, X, Lock, RefreshCw, Truck } from 'lucide-react';
import {
  fetchOpenDispatchBatches,
  openDispatchBatchApi,
  closeDispatchBatchApi,
} from '@/modules/outbound-dispatch/client/outboundDispatchApi';
import type {
  DispatchBatchStatus,
  DispatchBatchSummary,
} from '@/modules/outbound-dispatch/domain/types/dispatch-batch.types';
import { erpTableHeader, erpTableHeaderText, erpFieldClass, erpLabelClass } from '@/lib/design/tokens';

const BATCHES_QUERY_KEY = ['dispatch-batches', 'open'] as const;

const STATUS_STYLES: Record<DispatchBatchStatus, string> = {
  ABIERTO: 'bg-emerald-100 text-emerald-700',
  CERRADO: 'bg-amber-100 text-amber-700',
  DESPACHADO: 'bg-slate-200 text-slate-600',
};

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function DispatchBatchPanel() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [destination, setDestination] = useState('');
  const [guideOutbound, setGuideOutbound] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: BATCHES_QUERY_KEY,
    queryFn: fetchOpenDispatchBatches,
  });

  const batches: DispatchBatchSummary[] = data?.success ? data.data ?? [] : [];
  const apiError = data && !data.success ? data.error : undefined;

  const resetForm = () => {
    setDestination('');
    setGuideOutbound('');
    setNotes('');
    setShowForm(false);
  };

  const handleOpenBatch = async () => {
    setSubmitting(true);
    try {
      const res = await openDispatchBatchApi({
        destination: destination.trim() || undefined,
        guideOutbound: guideOutbound.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (!res.success) {
        notify.error('No se pudo abrir el lote', { description: res.error });
        return;
      }
      notify.success('Lote de salida abierto', {
        description: `Lote ${res.data?.batchNumber ?? ''}`,
      });
      resetForm();
      await queryClient.invalidateQueries({ queryKey: BATCHES_QUERY_KEY });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseBatch = async (batch: DispatchBatchSummary) => {
    const ok = await confirmDialog({
      title: 'Cerrar lote de salida',
      message: `¿Cerrar el lote ${batch.batchNumber}? No podrá recibir más equipos.`,
      confirmText: 'Cerrar lote',
      cancelText: 'Cancelar',
      tone: 'warning',
    });
    if (!ok) return;

    setClosingId(batch.id);
    try {
      const res = await closeDispatchBatchApi(batch.id);
      if (!res.success) {
        notify.error('No se pudo cerrar el lote', { description: res.error });
        return;
      }
      notify.success('Lote cerrado', { description: `Lote ${batch.batchNumber}` });
      await queryClient.invalidateQueries({ queryKey: BATCHES_QUERY_KEY });
    } finally {
      setClosingId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <Card className="p-6">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--primary)]/5 text-[var(--heading)] rounded-lg">
              <Boxes className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">Lotes de salida</h3>
              <p className="text-sm text-slate-500">
                Agrupa despachos en un lote, ciérralo y consolida la guía de salida.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => refetch()}
              leftIcon={<RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />}
            >
              Actualizar
            </Button>
            <Button
              variant="primary"
              onClick={() => setShowForm((v) => !v)}
              leftIcon={showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            >
              {showForm ? 'Cancelar' : 'Abrir lote'}
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="mb-6 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in">
            <div className="flex flex-col gap-1">
              <label className={erpLabelClass}>Destino</label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="Agencia / CAC destino"
                className={erpFieldClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={erpLabelClass}>Guía de salida</label>
              <input
                value={guideOutbound}
                onChange={(e) => setGuideOutbound(e.target.value)}
                placeholder="Número de guía (opcional)"
                className={erpFieldClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={erpLabelClass}>Notas</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones (opcional)"
                className={erpFieldClass}
              />
            </div>
            <div className="md:col-span-3 flex justify-end">
              <Button variant="primary" onClick={handleOpenBatch} disabled={submitting}>
                {submitting ? 'Abriendo…' : 'Confirmar apertura'}
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="py-12 text-center text-slate-400 text-sm">Cargando lotes…</div>
        ) : isError ? (
          <div className="py-12 text-center text-rose-500 text-sm">
            Error al cargar los lotes de salida.
          </div>
        ) : apiError ? (
          <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-amber-200 rounded-2xl bg-amber-50/50">
            <h4 className="font-bold text-amber-700 mb-1">Módulo de lotes no disponible</h4>
            <p className="text-amber-600 text-sm max-w-md text-center">{apiError}</p>
          </div>
        ) : batches.length === 0 ? (
          <div className="py-12 flex flex-col items-center justify-center border-2 border-dashed border-[var(--border)] rounded-2xl bg-[var(--surface-hover)]/50">
            <Truck className="w-14 h-14 text-[var(--accent)] mb-3 opacity-50" />
            <h4 className="font-bold text-slate-600 mb-1">No hay lotes abiertos</h4>
            <p className="text-slate-400 text-sm">Abre un lote para empezar a consolidar despachos.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full min-w-[820px] text-left border-collapse text-sm">
              <thead>
                <tr className={`${erpTableHeader} text-[11px] uppercase tracking-wider`}>
                  <th className={`p-3 font-black ${erpTableHeaderText}`}>Lote</th>
                  <th className={`p-3 font-black ${erpTableHeaderText}`}>Estado</th>
                  <th className={`p-3 font-black ${erpTableHeaderText}`}>Destino</th>
                  <th className={`p-3 font-black ${erpTableHeaderText}`}>Guía</th>
                  <th className={`p-3 font-black ${erpTableHeaderText}`}>Abierto por</th>
                  <th className={`p-3 font-black ${erpTableHeaderText}`}>Creado</th>
                  <th className={`p-3 font-black ${erpTableHeaderText} text-right`}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)]/80 transition-colors">
                    <td className="p-3 font-bold text-[var(--heading)]">{batch.batchNumber}</td>
                    <td className="p-3">
                      <Badge className={`${STATUS_STYLES[batch.status]} font-bold px-3 py-0.5`}>
                        {batch.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-slate-600">{batch.destination || '—'}</td>
                    <td className="p-3 text-slate-600">{batch.guideOutbound || '—'}</td>
                    <td className="p-3 text-slate-600">{batch.openedByName || '—'}</td>
                    <td className="p-3 text-slate-500">{formatDate(batch.createdAt)}</td>
                    <td className="p-3 text-right">
                      {batch.status === 'ABIERTO' ? (
                        <Button
                          variant="outline"
                          onClick={() => handleCloseBatch(batch)}
                          disabled={closingId === batch.id}
                          leftIcon={<Lock className="w-3.5 h-3.5" />}
                        >
                          {closingId === batch.id ? 'Cerrando…' : 'Cerrar'}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
