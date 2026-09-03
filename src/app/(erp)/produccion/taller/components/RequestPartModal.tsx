'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, notify } from '@/components/ui';
import { erpFieldClass, erpLabelClass } from '@/lib/design/tokens';
import { createPartRequestApi, fetchPartsCatalog } from '@/lib/api/parts';
import { Loader2, PackagePlus, X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  serviceOrderId: string;
  seriesId?: string | null;
  serialNumber?: string | null;
  brandId?: string | null;
  modelId?: string | null;
  brandName?: string | null;
  modelName?: string | null;
  osLabel?: string | null;
  technicianId?: string | null;
  technicianName?: string | null;
};

export function RequestPartModal({
  open,
  onClose,
  onCreated,
  serviceOrderId,
  seriesId,
  serialNumber,
  brandId,
  modelId,
  brandName,
  modelName,
  osLabel,
  technicianId,
  technicianName,
}: Props) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loadingCat, setLoadingCat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogId, setCatalogId] = useState('');
  const [qty, setQty] = useState('1');
  const [priority, setPriority] = useState<'NORMAL' | 'URGENTE'>('NORMAL');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingCat(true);
      try {
        const items = await fetchPartsCatalog({
          brandId: brandId || undefined,
          modelId: modelId || undefined,
          activeOnly: true,
        });
        if (!cancelled) {
          setCatalog(items);
          setCatalogId(items[0]?.id || '');
        }
      } catch (e: any) {
        if (!cancelled) notify.error('No se pudo cargar catálogo', { description: e?.message });
      } finally {
        if (!cancelled) setLoadingCat(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, brandId, modelId]);

  const selected = useMemo(
    () => catalog.find((c) => c.id === catalogId),
    [catalog, catalogId]
  );

  if (!open) return null;

  const handleSubmit = async () => {
    if (!catalogId) {
      notify.warning('Selecciona una pieza del catálogo');
      return;
    }
    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum < 1) {
      notify.warning('Cantidad inválida');
      return;
    }
    setSaving(true);
    try {
      await createPartRequestApi({
        serviceOrderId,
        seriesId: seriesId || null,
        serialNumber: serialNumber || null,
        brandId: brandId || null,
        modelId: modelId || null,
        technicianId: technicianId || null,
        technicianName: technicianName || null,
        priority,
        reason: reason || null,
        notes: notes || null,
        catalogId,
        qty: qtyNum,
      });
      notify.success('Solicitud creada · OS en Esperando Partes');
      onCreated?.();
      onClose();
    } catch (e: any) {
      notify.error('No se pudo solicitar pieza', { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-blue-500" />
            <h3 className="text-xs font-black uppercase tracking-wider">Solicitar pieza</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--surface-hover)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-lg bg-[var(--surface-hover)] p-2 text-[11px] space-y-0.5">
            <div>
              <span className="text-[var(--muted)]">OS </span>
              <strong>{osLabel || serviceOrderId.slice(0, 8)}</strong>
            </div>
            <div>
              <span className="text-[var(--muted)]">SN </span>
              {serialNumber || '—'}
            </div>
            <div>
              <span className="text-[var(--muted)]">Equipo </span>
              {[brandName, modelName].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>

          <label className="block space-y-1">
            <span className={erpLabelClass}>Pieza (catálogo) *</span>
            {loadingCat ? (
              <div className="flex h-10 items-center gap-2 text-xs text-[var(--muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando…
              </div>
            ) : (
              <select
                className={erpFieldClass}
                value={catalogId}
                onChange={(e) => setCatalogId(e.target.value)}
              >
                <option value="">Seleccionar pieza…</option>
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.sku} · {c.name}
                    {typeof c.qty_available === 'number' ? ` (disp ${c.qty_available})` : ''}
                  </option>
                ))}
              </select>
            )}
            {selected?.requires_return && (
              <p className="text-[10px] font-semibold text-amber-600">
                Esta pieza requiere retorno de la mala a Bodega Mala.
              </p>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className={erpLabelClass}>Cantidad *</span>
              <input
                type="number"
                min={1}
                className={erpFieldClass}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className={erpLabelClass}>Prioridad</span>
              <select
                className={erpFieldClass}
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'NORMAL' | 'URGENTE')}
              >
                <option value="NORMAL">Normal</option>
                <option value="URGENTE">Urgente</option>
              </select>
            </label>
          </div>

          <label className="block space-y-1">
            <span className={erpLabelClass}>Motivo</span>
            <input
              className={erpFieldClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Falla / cambio de placa…"
            />
          </label>

          <label className="block space-y-1">
            <span className={erpLabelClass}>Observaciones</span>
            <textarea
              className={`${erpFieldClass} min-h-[72px]`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-[var(--border)] px-4 py-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || loadingCat || !catalogId}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirmar solicitud'}
          </Button>
        </div>
      </div>
    </div>
  );
}
