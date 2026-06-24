'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Loader2, Package, Plus, X } from 'lucide-react';
import type { DispatchBatchSummary } from '../domain/types/dispatch-batch.types';
import {
  closeDispatchBatchApi,
  fetchOpenDispatchBatches,
  openDispatchBatchApi,
} from '../client/outboundDispatchApi';

type Props = {
  selectedBatchId: string | null;
  onSelectBatch: (batchId: string | null, batchNumber?: string | null) => void;
};

export function DispatchBatchSelector({ selectedBatchId, onSelectBatch }: Props) {
  const [batches, setBatches] = useState<DispatchBatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [showOpenForm, setShowOpenForm] = useState(false);
  const [destination, setDestination] = useState('');
  const [guideOutbound, setGuideOutbound] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetchOpenDispatchBatches();
    if (res.success && res.data) {
      setBatches(res.data);
      if (selectedBatchId && !res.data.some((b) => b.id === selectedBatchId)) {
        onSelectBatch(null);
      }
    }
    setLoading(false);
  }, [onSelectBatch, selectedBatchId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleOpen = async () => {
    setActing(true);
    const res = await openDispatchBatchApi({
      destination: destination.trim() || undefined,
      guideOutbound: guideOutbound.trim() || undefined,
    });
    setActing(false);
    if (!res.success) {
      alert(res.error || 'No se pudo abrir el lote.');
      return;
    }
    setShowOpenForm(false);
    setDestination('');
    setGuideOutbound('');
    await refresh();
    if (res.data) onSelectBatch(res.data.batchId, res.data.batchNumber);
  };

  const handleClose = async () => {
    if (!selectedBatchId) return;
    if (!confirm('¿Cerrar este lote de salida? Todas las cajas deben estar despachadas.')) return;
    setActing(true);
    const res = await closeDispatchBatchApi(selectedBatchId);
    setActing(false);
    if (!res.success) {
      alert(res.error || 'No se pudo cerrar el lote.');
      return;
    }
    onSelectBatch(null);
    await refresh();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Package className="h-4 w-4 text-emerald-600" />
          Lote de salida (opcional)
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowOpenForm((v) => !v)}
            disabled={acting}
          >
            <Plus className="mr-1 h-3 w-3" />
            Nuevo lote
          </Button>
          {selectedBatchId && (
            <Button type="button" variant="outline" size="sm" onClick={handleClose} disabled={acting}>
              <X className="mr-1 h-3 w-3" />
              Cerrar lote
            </Button>
          )}
        </div>
      </div>

      {showOpenForm && (
        <div className="mb-3 grid gap-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-600">
          <input
            className="rounded border px-2 py-1 text-sm dark:bg-slate-800"
            placeholder="Destino (opcional)"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
          />
          <input
            className="rounded border px-2 py-1 text-sm dark:bg-slate-800"
            placeholder="Guía salida (opcional)"
            value={guideOutbound}
            onChange={(e) => setGuideOutbound(e.target.value)}
          />
          <Button type="button" size="sm" onClick={handleOpen} disabled={acting}>
            {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Abrir lote'}
          </Button>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-500">Cargando lotes abiertos…</p>
      ) : (
        <select
          className="w-full rounded border px-2 py-2 text-sm dark:bg-slate-800"
          value={selectedBatchId || ''}
          onChange={(e) => {
            const id = e.target.value || null;
            const batch = batches.find((b) => b.id === id);
            onSelectBatch(id, batch?.batchNumber ?? null);
          }}
        >
          <option value="">Sin lote — despacho individual</option>
          {batches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.batchNumber}
              {b.destination ? ` — ${b.destination}` : ''}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
