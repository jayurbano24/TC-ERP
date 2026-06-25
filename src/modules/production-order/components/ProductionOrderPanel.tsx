'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button, Badge, notify } from '@/components/ui';
import { ClipboardList, Loader2, Plus, CheckCircle2 } from 'lucide-react';
import type { ProductionOrderSummary } from '../domain/types/production-order.types';
import {
  approveProductionOrderApi,
  assignOsToProductionOrderApi,
  createProductionOrderApi,
  fetchActiveProductionOrders,
} from '../client/productionOrderApi';

export function ProductionOrderPanel() {
  const [orders, setOrders] = useState<ProductionOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [targetQty, setTargetQty] = useState(10);
  const [notes, setNotes] = useState('');
  const [assignPoId, setAssignPoId] = useState('');
  const [assignOsId, setAssignOsId] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetchActiveProductionOrders();
    if (res.success && res.data) setOrders(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleCreate = async () => {
    setActing(true);
    const res = await createProductionOrderApi({
      targetQuantity: targetQty,
      notes: notes.trim() || undefined,
    });
    setActing(false);
    if (!res.success) {
      notify.error('No se pudo crear la orden de producción', { description: res.error });
      return;
    }
    setNotes('');
    await refresh();
  };

  const handleApprove = async (poId: string) => {
    setActing(true);
    const res = await approveProductionOrderApi(poId);
    setActing(false);
    if (!res.success) notify.error('No se pudo aprobar la orden', { description: res.error });
    else await refresh();
  };

  const handleAssign = async () => {
    if (!assignPoId || !assignOsId.trim()) {
      notify.warning('Datos incompletos', { description: 'Seleccione PO e ingrese ID de OS.' });
      return;
    }
    setActing(true);
    const res = await assignOsToProductionOrderApi(assignPoId, assignOsId.trim());
    setActing(false);
    if (!res.success) notify.error('No se pudo asignar la OS', { description: res.error });
    else {
      setAssignOsId('');
      await refresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border-2 border-slate-100 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <ClipboardList className="h-6 w-6 text-[#2ec4f1]" />
          <div>
            <h2 className="text-lg font-black text-[#181c3a]">Órdenes de Producción (PO)</h2>
            <p className="text-xs text-slate-500">Agrupa equipos en bodega para trabajo de taller.</p>
          </div>
        </div>

        <div className="mb-6 grid gap-3 rounded-xl border border-dashed border-slate-200 p-4 md:grid-cols-3">
          <input
            type="number"
            min={1}
            className="rounded-lg border px-3 py-2 text-sm"
            value={targetQty}
            onChange={(e) => setTargetQty(Number(e.target.value) || 1)}
            placeholder="Cantidad objetivo"
          />
          <input
            className="rounded-lg border px-3 py-2 text-sm md:col-span-2"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas (opcional)"
          />
          <Button type="button" onClick={handleCreate} disabled={acting} className="md:col-span-3">
            {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Nueva PO (borrador)
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Cargando PO activas…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-slate-500">No hay PO activas. Cree una para comenzar.</p>
        ) : (
          <div className="space-y-3">
            {orders.map((po) => (
              <div
                key={po.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4"
              >
                <div>
                  <p className="font-bold text-[#181c3a]">{po.poNumber}</p>
                  <p className="text-xs text-slate-500">
                    Meta: {po.targetQuantity} · Asignadas: {po.assignedCount ?? 0}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{po.status}</Badge>
                  {po.status === 'BORRADOR' && (
                    <Button type="button" size="sm" variant="outline" onClick={() => handleApprove(po.id)} disabled={acting}>
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      Aprobar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-3xl border-2 border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-700">Asignar OS a PO</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={assignPoId}
            onChange={(e) => setAssignPoId(e.target.value)}
          >
            <option value="">Seleccionar PO…</option>
            {orders
              .filter((o) => o.status === 'APROBADA' || o.status === 'EN_PROCESO')
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.poNumber} ({o.status})
                </option>
              ))}
          </select>
          <input
            className="rounded-lg border px-3 py-2 text-sm md:col-span-2"
            value={assignOsId}
            onChange={(e) => setAssignOsId(e.target.value)}
            placeholder="UUID de service_order"
          />
          <Button type="button" onClick={handleAssign} disabled={acting} className="md:col-span-3">
            Asignar equipo
          </Button>
        </div>
      </div>
    </div>
  );
}
