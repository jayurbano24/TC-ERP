'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  DataTable,
  notify,
  confirmDialog,
  type DataTableColumn,
} from '@/components/ui';
import { Package, Plus, Edit3, Trash2, X, Loader2 } from 'lucide-react';
import { adjustPartsStock, fetchPartsCatalog, savePartsCatalog } from '@/lib/api/parts';
import { getBrands, getModels } from '@/shared/catalogs/catalogs';
import { erpTableHeader, erpTableHeaderText } from '@/lib/design/tokens';

type StockSourceType = 'NEW' | 'RECOVERED';

type PartCatalogRow = {
  id: string;
  sku: string;
  name: string;
  category?: string | null;
  brand_id?: string | null;
  model_id?: string | null;
  standard_cost?: number;
  stock_min?: number;
  reorder_point?: number;
  lead_time_days?: number;
  requires_return?: boolean;
  active?: boolean;
  qty_on_hand?: number;
  qty_reserved?: number;
  qty_available?: number;
  qty_new_on_hand?: number;
  qty_recovered_on_hand?: number;
  qty_new_reserved?: number;
  qty_recovered_reserved?: number;
  qty_new_available?: number;
  qty_recovered_available?: number;
  location?: string | null;
  brands?: { id: string; name: string } | null;
  models?: { id: string; name: string } | null;
  brand_name?: string | null;
  model_name?: string | null;
};

type FormState = {
  sku: string;
  name: string;
  category: string;
  brand_id: string;
  model_id: string;
  standard_cost: string;
  stock_min: string;
  reorder_point: string;
  lead_time_days: string;
  requires_return: boolean;
  active: boolean;
  initial_qty: string;
  initial_stock_type: StockSourceType;
};

type AdjustState = {
  direction: 'IN' | 'OUT';
  stockType: StockSourceType;
  qty: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  sku: '',
  name: '',
  category: '',
  brand_id: '',
  model_id: '',
  standard_cost: '0',
  stock_min: '0',
  reorder_point: '0',
  lead_time_days: '7',
  requires_return: true,
  active: true,
  initial_qty: '',
  initial_stock_type: 'NEW',
};

const EMPTY_ADJUST: AdjustState = {
  direction: 'IN',
  stockType: 'NEW',
  qty: '1',
  notes: '',
};

const tableBadgeClass = 'px-1.5 py-0 text-[8px] font-black uppercase tracking-wide rounded-sm';

const modalLabelClass = 'text-[9px] font-black uppercase tracking-wide text-[var(--muted)]';
const modalFieldClass =
  'w-full h-8 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)] px-2 text-xs font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60';

function num(v: unknown): number {
  return Number(v ?? 0) || 0;
}

function available(onHand: unknown, reserved: unknown): number {
  return Math.max(0, num(onHand) - num(reserved));
}

function StockInlineBar({
  total,
  nuevo,
  recuperado,
  dispNew,
  dispRecovered,
  location,
}: {
  total: number;
  nuevo: number;
  recuperado: number;
  dispNew: number;
  dispRecovered: number;
  location?: string | null;
}) {
  const item = (label: string, value: number, tone?: string) => (
    <span className="whitespace-nowrap">
      <span className="text-slate-400">{label}</span>{' '}
      <strong className={`tabular-nums ${tone ?? ''}`}>{value}</strong>
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[10px]">
      {item('Total', total)}
      {item('Nuevo', nuevo, 'text-sky-700')}
      {item('Recup.', recuperado, 'text-violet-700')}
      {item('Disp.N', dispNew, 'text-sky-600')}
      {item('Disp.R', dispRecovered, 'text-violet-600')}
      <span className="min-w-0 truncate text-slate-500" title={location || ''}>
        Ubic. <strong>{location || '—'}</strong>
      </span>
    </div>
  );
}

/** Catálogo maestro de piezas — Configuración (stock Nuevo / Recuperado visible y ajustable). */
export function PiezasCatalogView() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<PartCatalogRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [adjust, setAdjust] = useState<AdjustState>(EMPTY_ADJUST);
  const [busy, setBusy] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const catalogQuery = useQuery({
    queryKey: ['parts-catalog-config'],
    queryFn: () => fetchPartsCatalog({ activeOnly: false }),
  });
  const brandsQuery = useQuery({
    queryKey: ['parts-brands'],
    queryFn: async () => (await getBrands()) || [],
  });
  const modelsQuery = useQuery({
    queryKey: ['parts-models'],
    queryFn: async () => (await getModels()) || [],
  });

  const items = (catalogQuery.data ?? []) as PartCatalogRow[];
  const brands = brandsQuery.data ?? [];
  const models = modelsQuery.data ?? [];

  const modelsForBrand = useMemo(() => {
    if (!form.brand_id) return models as Array<{ id: string; brand_id?: string; name?: string; nombre?: string }>;
    return (models as Array<{ id: string; brand_id?: string; name?: string; nombre?: string }>).filter(
      (m) => String(m.brand_id) === form.brand_id,
    );
  }, [models, form.brand_id]);

  const allSelected = items.length > 0 && selectedIds.length === items.length;

  const closeModal = () => {
    setShowModal(false);
    setEditingSku(null);
    setEditingRow(null);
    setAdjust(EMPTY_ADJUST);
  };

  const openCreate = () => {
    setEditingSku(null);
    setEditingRow(null);
    setForm(EMPTY_FORM);
    setAdjust(EMPTY_ADJUST);
    setShowModal(true);
  };

  const openEdit = (row: PartCatalogRow) => {
    setEditingSku(row.sku);
    setEditingRow(row);
    setForm({
      sku: row.sku || '',
      name: row.name || '',
      category: row.category || '',
      brand_id: row.brand_id || '',
      model_id: row.model_id || '',
      standard_cost: String(row.standard_cost ?? 0),
      stock_min: String(row.stock_min ?? 0),
      reorder_point: String(row.reorder_point ?? 0),
      lead_time_days: String(row.lead_time_days ?? 7),
      requires_return: row.requires_return !== false,
      active: row.active !== false,
      initial_qty: '',
      initial_stock_type: 'NEW',
    });
    setAdjust(EMPTY_ADJUST);
    setShowModal(true);
  };

  const invalidateCatalog = async () => {
    await qc.invalidateQueries({ queryKey: ['parts-catalog-config'] });
    await qc.invalidateQueries({ queryKey: ['parts-catalog'] });
    await qc.invalidateQueries({ queryKey: ['parts-inventory'] });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sku.trim() || !form.name.trim()) {
      notify.warning('SKU y nombre son obligatorios');
      return;
    }
    setBusy(true);
    try {
      const saved = await savePartsCatalog({
        sku: form.sku.trim().toUpperCase(),
        name: form.name.trim(),
        category: form.category || null,
        brand_id: form.brand_id || null,
        model_id: form.model_id || null,
        standard_cost: Number(form.standard_cost) || 0,
        stock_min: Number(form.stock_min) || 0,
        reorder_point: Number(form.reorder_point) || 0,
        lead_time_days: Number(form.lead_time_days) || 0,
        requires_return: form.requires_return,
        active: form.active,
      });

      const initialQty = Math.abs(Number(form.initial_qty));
      const catalogId = (saved?.item?.id as string | undefined) ?? editingRow?.id;
      if (!editingSku && catalogId && Number.isFinite(initialQty) && initialQty > 0) {
        await adjustPartsStock({
          catalogId,
          qtyDelta: initialQty,
          stockType: form.initial_stock_type,
          notes: 'Stock inicial desde Configuración',
        });
      }

      notify.success(
        editingSku
          ? 'Pieza actualizada'
          : initialQty > 0
            ? `Pieza creada con ${initialQty} en almacén ${form.initial_stock_type === 'NEW' ? 'nuevo' : 'recuperado'}`
            : 'Pieza creada en catálogo',
      );
      closeModal();
      await invalidateCatalog();
    } catch (err: unknown) {
      notify.error('No se pudo guardar', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleApplyAdjust = async () => {
    if (!editingRow?.id) return;
    const qty = Math.abs(Number(adjust.qty));
    if (!Number.isFinite(qty) || qty < 1) {
      notify.warning('Indica una cantidad mayor a 0');
      return;
    }
    const qtyDelta = adjust.direction === 'OUT' ? -qty : qty;
    setBusy(true);
    try {
      await adjustPartsStock({
        catalogId: editingRow.id,
        qtyDelta,
        stockType: adjust.stockType,
        notes: adjust.notes || undefined,
      });
      notify.success(
        adjust.direction === 'OUT'
          ? `Restados ${qty} del almacén ${adjust.stockType === 'NEW' ? 'nuevo' : 'recuperado'}`
          : `Sumados ${qty} al almacén ${adjust.stockType === 'NEW' ? 'nuevo' : 'recuperado'}`,
      );
      await invalidateCatalog();
      const refreshed = (await fetchPartsCatalog({ activeOnly: false })) as PartCatalogRow[];
      const updated = refreshed.find((r) => r.id === editingRow.id);
      if (updated) setEditingRow(updated);
      setAdjust(EMPTY_ADJUST);
    } catch (err: unknown) {
      notify.error('No se pudo ajustar stock', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const deactivateRow = async (row: PartCatalogRow) => {
    await savePartsCatalog({
      sku: row.sku,
      name: row.name,
      brand_id: row.brand_id,
      model_id: row.model_id,
      category: row.category,
      standard_cost: Number(row.standard_cost) || 0,
      stock_min: Number(row.stock_min) || 0,
      reorder_point: Number(row.reorder_point) || 0,
      lead_time_days: Number(row.lead_time_days) || 0,
      requires_return: row.requires_return !== false,
      active: false,
    });
  };

  const handleDeactivate = async (row: PartCatalogRow) => {
    const ok = await confirmDialog({
      title: 'Desactivar pieza',
      message: `¿Desactivar ${row.sku}? Dejará de aparecer en solicitudes nuevas.`,
      confirmText: 'Desactivar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deactivateRow(row);
      notify.success('Pieza desactivada');
      setSelectedIds((prev) => prev.filter((id) => id !== String(row.id)));
      await invalidateCatalog();
    } catch (err: unknown) {
      notify.error('No se pudo desactivar', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleBulkDeactivate = async () => {
    const targets = items.filter(
      (row) => selectedIds.includes(String(row.id)) && row.active !== false,
    );
    if (targets.length === 0) {
      notify.warning('Seleccione piezas activas para desactivar');
      return;
    }
    const ok = await confirmDialog({
      title: 'Desactivar piezas seleccionadas',
      message: `¿Desactivar ${targets.length} pieza(s)?`,
      confirmText: 'Desactivar',
    });
    if (!ok) return;
    setBusy(true);
    try {
      for (const row of targets) {
        await deactivateRow(row);
      }
      notify.success(`${targets.length} pieza(s) desactivada(s)`);
      setSelectedIds([]);
      await invalidateCatalog();
    } catch (err: unknown) {
      notify.error('Error en desactivación masiva', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const columns: DataTableColumn<PartCatalogRow>[] = [
    {
      id: 'select',
      width: '32px',
      header: (
        <input
          type="checkbox"
          aria-label="Seleccionar todas las piezas"
          checked={allSelected}
          onChange={(e) =>
            setSelectedIds(e.target.checked ? items.map((r) => String(r.id)) : [])
          }
          className="h-3.5 w-3.5 accent-[var(--primary)]"
        />
      ),
      cell: (row) => (
        <input
          type="checkbox"
          aria-label={`Seleccionar ${row.sku}`}
          checked={selectedIds.includes(String(row.id))}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            setSelectedIds((current) =>
              e.target.checked
                ? [...new Set([...current, String(row.id)])]
                : current.filter((id) => id !== String(row.id)),
            )
          }
          className="h-3.5 w-3.5 accent-[var(--primary)]"
        />
      ),
    },
    {
      id: 'sku',
      header: 'SKU',
      width: '84px',
      cell: (r) => <span className="font-mono text-[10px] font-bold">{r.sku}</span>,
    },
    {
      id: 'name',
      header: 'Nombre',
      width: 'minmax(96px,1fr)',
      cell: (r) => <span className="truncate font-semibold text-[#181c3a]">{r.name}</span>,
    },
    {
      id: 'category',
      header: 'Cat.',
      width: '64px',
      cell: (r) => <span className="truncate text-[10px] text-slate-500">{r.category || '—'}</span>,
    },
    {
      id: 'brand',
      header: 'Marca',
      width: '68px',
      cell: (r) => <span className="truncate">{r.brands?.name || r.brand_name || '—'}</span>,
    },
    {
      id: 'model',
      header: 'Modelo',
      width: '88px',
      cell: (r) => <span className="truncate">{r.models?.name || r.model_name || '—'}</span>,
    },
    {
      id: 'cost',
      header: 'Costo',
      width: '56px',
      align: 'right',
      cell: (r) => (
        <span className="tabular-nums text-[10px]">{num(r.standard_cost).toFixed(2)}</span>
      ),
    },
    {
      id: 'total',
      header: 'Total',
      width: '48px',
      align: 'right',
      cell: (r) => <span className="tabular-nums font-bold">{num(r.qty_on_hand)}</span>,
    },
    {
      id: 'stock_new',
      header: 'Nuevo',
      width: '52px',
      align: 'right',
      cell: (r) => (
        <span className="tabular-nums font-bold text-sky-700" title="Almacén nuevo">
          {num(r.qty_new_on_hand)}
        </span>
      ),
    },
    {
      id: 'stock_recovered',
      header: 'Recup.',
      width: '52px',
      align: 'right',
      cell: (r) => (
        <span className="tabular-nums font-bold text-violet-700" title="Almacén recuperado">
          {num(r.qty_recovered_on_hand)}
        </span>
      ),
    },
    {
      id: 'reserved',
      header: 'Reserv.',
      width: '52px',
      align: 'right',
      cell: (r) => <span className="tabular-nums font-bold text-amber-600">{num(r.qty_reserved)}</span>,
    },
    {
      id: 'available',
      header: 'Disp.',
      width: '48px',
      align: 'right',
      cell: (r) => {
        const avail = num(r.qty_available ?? available(r.qty_on_hand, r.qty_reserved));
        return (
          <span className={`tabular-nums font-black ${avail <= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {avail}
          </span>
        );
      },
    },
    {
      id: 'min',
      header: 'Mín',
      width: '40px',
      align: 'right',
      cell: (r) => <span className="tabular-nums">{num(r.stock_min)}</span>,
    },
    {
      id: 'location',
      header: 'Ubicación',
      width: '88px',
      cell: (r) => (
        <span className="block truncate text-[10px] text-slate-500" title={r.location || ''}>
          {r.location || '—'}
        </span>
      ),
    },
    {
      id: 'return',
      header: 'Ret.',
      width: '44px',
      cell: (r) =>
        r.requires_return ? (
          <Badge variant="yellow" className={tableBadgeClass}>
            Sí
          </Badge>
        ) : (
          <Badge variant="slate" className={tableBadgeClass}>
            No
          </Badge>
        ),
    },
    {
      id: 'status',
      header: 'Estado',
      width: '64px',
      cell: (r) =>
        r.active !== false ? (
          <Badge variant="green" className={tableBadgeClass}>
            Activo
          </Badge>
        ) : (
          <Badge variant="slate" className={tableBadgeClass}>
            Inactivo
          </Badge>
        ),
    },
    {
      id: 'actions',
      header: 'Acc.',
      width: '68px',
      sticky: 'end',
      align: 'right',
      cell: (r) => (
        <div className="flex justify-end gap-0.5">
          <button
            type="button"
            className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
            onClick={() => openEdit(r)}
            title="Editar"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          {r.active !== false && (
            <button
              type="button"
              className="rounded p-1.5 text-rose-500 hover:bg-rose-50"
              onClick={() => void handleDeactivate(r)}
              title="Desactivar"
              disabled={busy}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const modalStockTotal = num(editingRow?.qty_on_hand);
  const modalStockNew = num(editingRow?.qty_new_on_hand);
  const modalStockRecovered = num(editingRow?.qty_recovered_on_hand);

  return (
    <div className="animate-rise-in space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl bg-sky-50 p-2.5">
            <Package className="h-5 w-5 text-sky-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-black text-[#181c3a]">Piezas / SKU</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Catálogo · Inventario Nuevo / Recuperado
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/bodega/partes"
            className="text-[10px] font-black uppercase tracking-wide text-sky-700 hover:underline"
          >
            Bodega de Partes →
          </Link>
          <Button
            variant="primary"
            size="sm"
            onClick={openCreate}
            className="bg-[#181c3a] text-white"
            leftIcon={<Plus className="h-4 w-4" />}
          >
            Nueva pieza
          </Button>
        </div>
      </div>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <span className="text-[10px] font-black uppercase text-amber-800">
            {selectedIds.length} seleccionada(s)
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[10px] font-black uppercase"
            disabled={busy}
            onClick={() => void handleBulkDeactivate()}
          >
            Desactivar seleccionadas
          </Button>
          <button
            type="button"
            className="text-[10px] font-bold uppercase text-slate-500 hover:text-slate-800"
            onClick={() => setSelectedIds([])}
          >
            Limpiar
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        {catalogQuery.isLoading ? (
          <div className="flex justify-center gap-2 py-12 text-sm font-semibold text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
          </div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Package size={40} className="mx-auto mb-2 opacity-40" />
            <p className="text-[10px] font-black uppercase tracking-widest">Sin piezas en el catálogo</p>
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={items}
            getRowId={(row) => String(row.id)}
            compact
            dense
            rowHeight={36}
            maxBodyHeight={560}
            minWidth={1280}
            headerClassName={erpTableHeader}
            headerTextClassName={erpTableHeaderText}
            ariaLabel="Catálogo de piezas SKU"
            onRowClick={(row) => openEdit(row)}
          />
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/60 p-3 backdrop-blur-md">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between bg-[#181c3a] px-3 py-2 text-white">
              <h3 className="text-xs font-black uppercase tracking-wide">
                {editingSku ? 'Editar pieza' : 'Nueva pieza'}
              </h3>
              <button type="button" onClick={closeModal} className="text-white/50 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <form onSubmit={(e) => void handleSave(e)} className="space-y-2.5 p-3">
              {editingRow ? (
                <StockInlineBar
                  total={modalStockTotal}
                  nuevo={modalStockNew}
                  recuperado={modalStockRecovered}
                  dispNew={num(
                    editingRow.qty_new_available ?? available(modalStockNew, editingRow.qty_new_reserved),
                  )}
                  dispRecovered={num(
                    editingRow.qty_recovered_available ??
                      available(modalStockRecovered, editingRow.qty_recovered_reserved),
                  )}
                  location={editingRow.location}
                />
              ) : (
                <div className="grid grid-cols-[1fr_72px] gap-2 rounded-lg border border-sky-100 bg-sky-50/70 px-2 py-1.5">
                  <label className="block space-y-0.5">
                    <span className={modalLabelClass}>Stock inicial · almacén</span>
                    <select
                      className={modalFieldClass}
                      value={form.initial_stock_type}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          initial_stock_type: e.target.value as StockSourceType,
                        }))
                      }
                    >
                      <option value="NEW">Nuevo</option>
                      <option value="RECOVERED">Recuperado</option>
                    </select>
                  </label>
                  <label className="block space-y-0.5">
                    <span className={modalLabelClass}>Cant.</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      className={modalFieldClass}
                      placeholder="0"
                      value={form.initial_qty}
                      onChange={(e) => setForm((f) => ({ ...f, initial_qty: e.target.value }))}
                    />
                  </label>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <label className="block space-y-0.5">
                  <span className={modalLabelClass}>SKU *</span>
                  <input
                    className={modalFieldClass}
                    required
                    value={form.sku}
                    disabled={Boolean(editingSku)}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
                  />
                </label>
                <label className="col-span-2 block space-y-0.5">
                  <span className={modalLabelClass}>Nombre *</span>
                  <input
                    className={modalFieldClass}
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className={modalLabelClass}>Categoría</span>
                  <input
                    className={modalFieldClass}
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className={modalLabelClass}>Costo</span>
                  <input
                    type="number"
                    className={modalFieldClass}
                    value={form.standard_cost}
                    onChange={(e) => setForm((f) => ({ ...f, standard_cost: e.target.value }))}
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className={modalLabelClass}>Lead (días)</span>
                  <input
                    type="number"
                    className={modalFieldClass}
                    value={form.lead_time_days}
                    onChange={(e) => setForm((f) => ({ ...f, lead_time_days: e.target.value }))}
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className={modalLabelClass}>Marca</span>
                  <select
                    className={modalFieldClass}
                    value={form.brand_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, brand_id: e.target.value, model_id: '' }))
                    }
                  >
                    <option value="">—</option>
                    {(brands as Array<{ id: string; name?: string; nombre?: string }>).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name || b.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 block space-y-0.5">
                  <span className={modalLabelClass}>Modelo</span>
                  <select
                    className={modalFieldClass}
                    value={form.model_id}
                    onChange={(e) => setForm((f) => ({ ...f, model_id: e.target.value }))}
                  >
                    <option value="">—</option>
                    {modelsForBrand.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name || m.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-0.5">
                  <span className={modalLabelClass}>Mín.</span>
                  <input
                    type="number"
                    className={modalFieldClass}
                    value={form.stock_min}
                    onChange={(e) => setForm((f) => ({ ...f, stock_min: e.target.value }))}
                  />
                </label>
                <label className="block space-y-0.5">
                  <span className={modalLabelClass}>Reorden</span>
                  <input
                    type="number"
                    className={modalFieldClass}
                    value={form.reorder_point}
                    onChange={(e) => setForm((f) => ({ ...f, reorder_point: e.target.value }))}
                  />
                </label>
              </div>

              {editingRow ? (
                <div className="space-y-1.5 rounded-lg border border-slate-200 p-2">
                  <div className={modalLabelClass}>Ajuste inventario</div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="inline-flex overflow-hidden rounded-md border border-slate-200">
                      <button
                        type="button"
                        className={`h-7 px-2.5 text-[9px] font-black uppercase ${
                          adjust.direction === 'IN'
                            ? 'bg-[#181c3a] text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                        onClick={() => setAdjust((a) => ({ ...a, direction: 'IN' }))}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className={`h-7 px-2.5 text-[9px] font-black uppercase ${
                          adjust.direction === 'OUT'
                            ? 'bg-[#181c3a] text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                        onClick={() => setAdjust((a) => ({ ...a, direction: 'OUT' }))}
                      >
                        −
                      </button>
                    </div>
                    <select
                      className={`${modalFieldClass} w-[7.5rem]`}
                      value={adjust.stockType}
                      onChange={(e) =>
                        setAdjust((a) => ({
                          ...a,
                          stockType: e.target.value as StockSourceType,
                        }))
                      }
                    >
                      <option value="NEW">Nuevo</option>
                      <option value="RECOVERED">Recuperado</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className={`${modalFieldClass} w-14`}
                      value={adjust.qty}
                      onChange={(e) => setAdjust((a) => ({ ...a, qty: e.target.value }))}
                    />
                    <input
                      className={`${modalFieldClass} min-w-[5rem] flex-1`}
                      placeholder="Notas"
                      value={adjust.notes}
                      onChange={(e) => setAdjust((a) => ({ ...a, notes: e.target.value }))}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 shrink-0 px-2 text-[9px] font-black uppercase"
                      disabled={busy}
                      onClick={() => void handleApplyAdjust()}
                    >
                      Aplicar
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-semibold">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={form.requires_return}
                    onChange={(e) => setForm((f) => ({ ...f, requires_return: e.target.checked }))}
                  />
                  Retorno pieza mala
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                  />
                  Activa
                </label>
              </div>
              <div className="flex justify-end gap-1.5 border-t border-slate-100 pt-2">
                <Button type="button" variant="outline" size="sm" className="h-8" onClick={closeModal}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" className="h-8" disabled={busy}>
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
