'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, notify } from '@/components/ui';
import { erpFieldClass, erpLabelClass } from '@/lib/design/tokens';
import {
  createPartRequestApi,
  createPartRequestBatchApi,
  fetchPartsCatalog,
} from '@/lib/api/parts';
import { Loader2, PackagePlus, X } from 'lucide-react';

/** Un lote entrega una pieza por orden; cambiarlo rompe la paridad OS ↔ pieza. */
const BATCH_QTY_PER_ORDER = 1;

export type PartRequestTarget = {
  serviceOrderId: string;
  seriesId?: string | null;
  seriesIds?: string[];
  serialNumber?: string | null;
  serialNumbers?: string[];
  brandId?: string | null;
  modelId?: string | null;
  brandName?: string | null;
  modelName?: string | null;
  osLabel?: string | null;
};

/** Devuelve el valor compartido por todas las OS, o null si difieren. */
function useSharedValue(
  targets: PartRequestTarget[],
  field: 'brandId' | 'modelId'
): string | null {
  return useMemo(() => {
    const first = targets[0]?.[field];
    if (!first) return null;
    return targets.every((target) => target[field] === first) ? first : null;
  }, [targets, field]);
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  serviceOrderId?: string;
  seriesId?: string | null;
  serialNumber?: string | null;
  brandId?: string | null;
  modelId?: string | null;
  brandName?: string | null;
  modelName?: string | null;
  osLabel?: string | null;
  technicianId?: string | null;
  technicianName?: string | null;
  targets?: PartRequestTarget[];
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
  targets,
}: Props) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [loadingCat, setLoadingCat] = useState(false);
  const [saving, setSaving] = useState(false);
  const [catalogId, setCatalogId] = useState('');
  const [qty, setQty] = useState('1');
  const [priority, setPriority] = useState<'NORMAL' | 'URGENTE'>('NORMAL');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const requestTargets = useMemo<PartRequestTarget[]>(() => {
    if (targets?.length) {
      return [
        ...new Map(
          targets
            .filter((target) => target.serviceOrderId)
            .map((target) => [target.serviceOrderId, target])
        ).values(),
      ];
    }
    if (!serviceOrderId) return [];
    return [
      {
        serviceOrderId,
        seriesId,
        serialNumber,
        brandId,
        modelId,
        brandName,
        modelName,
        osLabel,
      },
    ];
  }, [
    targets,
    serviceOrderId,
    seriesId,
    serialNumber,
    brandId,
    modelId,
    brandName,
    modelName,
    osLabel,
  ]);
  const isBatch = requestTargets.length > 1;
  const primaryTarget = requestTargets[0];

  /** Solo se filtra el catálogo si todas las OS comparten el mismo equipo. */
  const sharedBrandId = useSharedValue(requestTargets, 'brandId');
  const sharedModelId = useSharedValue(requestTargets, 'modelId');
  const mixedEquipment = isBatch && (!sharedBrandId || !sharedModelId);
  const equipmentLabel =
    [primaryTarget?.brandName, primaryTarget?.modelName].filter(Boolean).join(' ') ||
    'este equipo';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingCat(true);
      try {
        const items = await fetchPartsCatalog({
          brandId: sharedBrandId || undefined,
          modelId: sharedModelId || undefined,
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
  }, [open, sharedBrandId, sharedModelId]);

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
    const qtyNum = isBatch ? BATCH_QTY_PER_ORDER : Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum < 1) {
      notify.warning('Cantidad inválida');
      return;
    }
    setSaving(true);
    try {
      if (isBatch) {
        const result = await createPartRequestBatchApi({
          catalogId,
          qtyPerOrder: qtyNum,
          priority,
          reason: reason || null,
          notes: notes || null,
          orders: requestTargets.map((target) => ({
            serviceOrderId: target.serviceOrderId,
            seriesId: target.seriesId || null,
            seriesIds: target.seriesIds || [],
            serialNumber: target.serialNumber || null,
            serialNumbers: target.serialNumbers || [],
            brandId: target.brandId || null,
            modelId: target.modelId || null,
          })),
        });
        notify.success(`Lote ${result.batch.batch_number} creado`, {
          description:
            result.errors.length > 0
              ? `${result.created.length} OS creadas; ${result.errors.length} con error.`
              : `${result.created.length} órdenes enviadas a Esperando Partes.`,
        });
      } else {
        if (!primaryTarget?.serviceOrderId) {
          notify.warning('No se pudo identificar la orden de servicio');
          return;
        }
        await createPartRequestApi({
          serviceOrderId: primaryTarget.serviceOrderId,
          seriesId: primaryTarget.seriesId || null,
          seriesIds: primaryTarget.seriesIds || [],
          serialNumber: primaryTarget.serialNumber || null,
          serialNumbers: primaryTarget.serialNumbers || [],
          brandId: primaryTarget.brandId || null,
          modelId: primaryTarget.modelId || null,
          technicianId: technicianId || null,
          technicianName: technicianName || null,
          priority,
          reason: reason || null,
          notes: notes || null,
          catalogId,
          qty: qtyNum,
        });
        notify.success('Solicitud creada · OS en Esperando Partes');
      }
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
            <h3 className="text-xs font-black uppercase tracking-wider">
              {isBatch ? `Solicitar pieza por lote · ${requestTargets.length} OS` : 'Solicitar pieza'}
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-[var(--surface-hover)]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 p-4">
          <div className="rounded-lg bg-[var(--surface-hover)] p-2 text-[11px] space-y-0.5">
            <div>
              <span className="text-[var(--muted)]">OS </span>
              <strong>
                {isBatch
                  ? `${requestTargets.length} órdenes seleccionadas`
                  : primaryTarget?.osLabel || primaryTarget?.serviceOrderId.slice(0, 8)}
              </strong>
            </div>
            {isBatch ? (
              <>
                <div className="max-h-20 overflow-auto font-mono text-[10px]">
                  {requestTargets.map((target) => target.osLabel || target.serviceOrderId.slice(0, 8)).join(' · ')}
                </div>
                <div>
                  <span className="text-[var(--muted)]">Equipo </span>
                  {mixedEquipment ? 'Modelos mixtos' : equipmentLabel}
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-[var(--muted)]">SN </span>
                  {primaryTarget?.serialNumber || '—'}
                </div>
                <div>
                  <span className="text-[var(--muted)]">Equipo </span>
                  {[primaryTarget?.brandName, primaryTarget?.modelName].filter(Boolean).join(' · ') || '—'}
                </div>
              </>
            )}
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
            {!loadingCat && catalog.length === 0 && (
              <p className="text-[10px] font-semibold text-rose-600">
                {`No hay piezas activas en el catálogo para ${equipmentLabel}. Regístrala en Bodega de Partes antes de solicitarla.`}
              </p>
            )}
            {mixedEquipment && (
              <p className="text-[10px] font-semibold text-amber-600">
                Las OS seleccionadas no comparten marca y modelo, por eso se muestra el catálogo
                completo. Selecciona equipos iguales para filtrar las piezas compatibles.
              </p>
            )}
            {selected?.requires_return && (
              <p className="text-[10px] font-semibold text-amber-600">
                Esta pieza requiere retorno de la mala a Bodega Mala.
              </p>
            )}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className={erpLabelClass}>
                {isBatch ? 'Cantidad por OS' : 'Cantidad *'}
              </span>
              <input
                type="number"
                min={1}
                readOnly={isBatch}
                aria-readonly={isBatch}
                className={`${erpFieldClass}${
                  isBatch ? ' cursor-not-allowed bg-[var(--muted-bg,#f1f5f9)] text-[var(--muted)]' : ''
                }`}
                value={isBatch ? String(BATCH_QTY_PER_ORDER) : qty}
                onChange={(e) => {
                  if (isBatch) return;
                  setQty(e.target.value);
                }}
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
          {isBatch && (
            <p className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-2 text-[10px] font-semibold text-sky-800">
              Se crearán {requestTargets.length} solicitudes independientes y trazables, una por OS,
              agrupadas bajo el mismo número de lote. La cantidad es fija: {BATCH_QTY_PER_ORDER} pieza
              por OS.
            </p>
          )}

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
