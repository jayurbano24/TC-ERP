'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, notify, confirmDialog } from '@/components/ui';
import { Package, Plus, Edit3, Trash2, X, Loader2 } from 'lucide-react';
import { fetchPartsCatalog, savePartsCatalog } from '@/lib/api/parts';
import { getBrands, getModels } from '@/shared/catalogs/catalogs';
import { erpFieldClass, erpLabelClass } from '@/lib/design/tokens';

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
};

/** Catálogo maestro de piezas de reparación — vive en Configuración. */
export function PiezasCatalogView() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingSku, setEditingSku] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

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

  const items = catalogQuery.data ?? [];
  const brands = brandsQuery.data ?? [];
  const models = modelsQuery.data ?? [];

  const modelsForBrand = useMemo(() => {
    if (!form.brand_id) return models as any[];
    return (models as any[]).filter((m) => String(m.brand_id) === form.brand_id);
  }, [models, form.brand_id]);

  const openCreate = () => {
    setEditingSku(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (row: any) => {
    setEditingSku(row.sku);
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
    });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sku.trim() || !form.name.trim()) {
      notify.warning('SKU y nombre son obligatorios');
      return;
    }
    setBusy(true);
    try {
      await savePartsCatalog({
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
      notify.success(editingSku ? 'Pieza actualizada' : 'Pieza creada en catálogo');
      setShowModal(false);
      await qc.invalidateQueries({ queryKey: ['parts-catalog-config'] });
      await qc.invalidateQueries({ queryKey: ['parts-catalog'] });
      await qc.invalidateQueries({ queryKey: ['parts-inventory'] });
    } catch (err: any) {
      notify.error('No se pudo guardar', { description: err?.message });
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivate = async (row: any) => {
    const ok = await confirmDialog({
      title: 'Desactivar pieza',
      message: `¿Desactivar ${row.sku}? Dejará de aparecer en solicitudes nuevas.`,
      confirmText: 'Desactivar',
    });
    if (!ok) return;
    setBusy(true);
    try {
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
      notify.success('Pieza desactivada');
      await qc.invalidateQueries({ queryKey: ['parts-catalog-config'] });
      await qc.invalidateQueries({ queryKey: ['parts-catalog'] });
    } catch (err: any) {
      notify.error('No se pudo desactivar', { description: err?.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="animate-rise-in space-y-6">
      <div className="flex justify-between items-center bg-white p-8 rounded-3xl border-2 border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-sky-50 p-3 rounded-2xl shadow-lg shadow-sky-500/10">
            <Package className="w-6 h-6 text-sky-600" />
          </div>
          <div>
            <h3 className="text-xl font-black text-[#181c3a]">Piezas / SKU — Bodega de Partes</h3>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Crea aquí la pieza · Luego carga cantidad en Bodega de Partes → Inventario
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={openCreate}
          className="bg-[#181c3a] text-white shadow-xl"
          leftIcon={<Plus className="w-4 h-4" />}
        >
          Nueva pieza
        </Button>
      </div>

      <div className="bg-white rounded-3xl border-2 border-slate-100 overflow-hidden shadow-sm">
        {catalogQuery.isLoading ? (
          <div className="py-16 flex justify-center text-slate-400 gap-2 text-sm font-semibold">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Package size={48} className="mx-auto mb-3 opacity-40" />
            <p className="text-xs font-black uppercase tracking-widest">Sin piezas en el catálogo</p>
            <p className="text-sm mt-2">Crea el SKU aquí; luego carga cantidad en Bodega de Partes → Inventario.</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Marca</th>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3">Costo</th>
                <th className="px-4 py-3">Retorno</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(items as any[]).map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/80">
                  <td className="px-4 py-3 font-mono text-xs font-bold">{row.sku}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-[#181c3a]">{row.name}</td>
                  <td className="px-4 py-3 text-xs">{row.brands?.name || '—'}</td>
                  <td className="px-4 py-3 text-xs">{row.models?.name || '—'}</td>
                  <td className="px-4 py-3 tabular-nums text-xs">{Number(row.standard_cost || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    {row.requires_return ? (
                      <Badge variant="yellow">Sí</Badge>
                    ) : (
                      <Badge variant="slate">No</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {row.active ? (
                      <Badge variant="green">Activo</Badge>
                    ) : (
                      <Badge variant="slate">Inactivo</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
                        onClick={() => openEdit(row)}
                        title="Editar"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {row.active && (
                        <button
                          type="button"
                          className="p-2 rounded-lg hover:bg-rose-50 text-rose-500"
                          onClick={() => void handleDeactivate(row)}
                          title="Desactivar"
                          disabled={busy}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#181c3a]/60 backdrop-blur-md p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="bg-[#181c3a] px-5 py-4 text-white flex justify-between items-center">
              <h3 className="text-sm font-black uppercase tracking-wide">
                {editingSku ? 'Editar pieza' : 'Nueva pieza'}
              </h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-white/50 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={(e) => void handleSave(e)} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className={erpLabelClass}>SKU *</span>
                  <input
                    className={erpFieldClass}
                    required
                    value={form.sku}
                    disabled={Boolean(editingSku)}
                    onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value.toUpperCase() }))}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={erpLabelClass}>Nombre *</span>
                  <input
                    className={erpFieldClass}
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={erpLabelClass}>Categoría</span>
                  <input
                    className={erpFieldClass}
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={erpLabelClass}>Costo estándar</span>
                  <input
                    type="number"
                    className={erpFieldClass}
                    value={form.standard_cost}
                    onChange={(e) => setForm((f) => ({ ...f, standard_cost: e.target.value }))}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={erpLabelClass}>Marca</span>
                  <select
                    className={erpFieldClass}
                    value={form.brand_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, brand_id: e.target.value, model_id: '' }))
                    }
                  >
                    <option value="">—</option>
                    {(brands as any[]).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name || b.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className={erpLabelClass}>Modelo</span>
                  <select
                    className={erpFieldClass}
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
                <label className="block space-y-1">
                  <span className={erpLabelClass}>Stock mínimo</span>
                  <input
                    type="number"
                    className={erpFieldClass}
                    value={form.stock_min}
                    onChange={(e) => setForm((f) => ({ ...f, stock_min: e.target.value }))}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={erpLabelClass}>Punto reorden</span>
                  <input
                    type="number"
                    className={erpFieldClass}
                    value={form.reorder_point}
                    onChange={(e) => setForm((f) => ({ ...f, reorder_point: e.target.value }))}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm font-semibold pt-1">
                <input
                  type="checkbox"
                  checked={form.requires_return}
                  onChange={(e) => setForm((f) => ({ ...f, requires_return: e.target.checked }))}
                />
                Requiere retorno de pieza mala (Bodega Mala)
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                />
                Activa
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
