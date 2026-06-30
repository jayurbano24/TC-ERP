"use client";

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, Badge, notify, confirmDialog, DataTable, type DataTableColumn } from '@/components/ui';
import { ModulePage } from '@/components/module-page';
import { 
  CircleDollarSign, 
  Settings, 
  Plus, 
  Trash2, 
  Edit3, 
  Save, 
  X,
  TrendingUp,
  FileText,
  Calculator
} from 'lucide-react';
import { getActivityCosts, saveActivityCost, deleteActivityCost, ActivityCost } from '@/modules/finance-costing/client/costs';
import { getReceptionsWithSeries } from '@/modules/recepcion/client/receptions'; // To fetch backoffice records

const EMPTY_COSTS: ActivityCost[] = [];
const EMPTY_RECEPTIONS: any[] = [];

export default function CostosPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'config'>('dashboard');
  const [busy, setBusy] = useState(false);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', cost: '', description: '' });

  const costsQuery = useQuery({ queryKey: ['activity-costs'], queryFn: () => getActivityCosts() });
  const receptionsQuery = useQuery({ queryKey: ['costos-receptions'], queryFn: () => getReceptionsWithSeries() });

  const costs = costsQuery.data ?? EMPTY_COSTS;
  const receptions = receptionsQuery.data ?? EMPTY_RECEPTIONS;
  const loading = costsQuery.isLoading;
  const dashboardLoading = receptionsQuery.isLoading;

  const refreshData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['activity-costs'] }),
      queryClient.invalidateQueries({ queryKey: ['costos-receptions'] }),
    ]);
  };

  const handleEdit = (cost: ActivityCost) => {
    setEditingId(cost.id);
    setFormData({
      name: cost.name,
      cost: cost.cost.toString(),
      description: cost.description || ''
    });
  };

  const handleSave = async () => {
    if (!formData.name || !formData.cost) {
      notify.warning('Datos incompletos', { description: 'Nombre y Costo son requeridos.' });
      return;
    }
    
    setBusy(true);
    const { data, error } = await saveActivityCost({
      id: editingId || '',
      name: formData.name,
      cost: parseFloat(formData.cost) || 0,
      description: formData.description
    });
    
    if (error) {
      notify.error('Error guardando el costo', { description: String(error) });
    } else {
      await refreshData();
      setEditingId(null);
      setFormData({ name: '', cost: '', description: '' });
    }
    setBusy(false);
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ title: 'Eliminar costo', message: '¿Eliminar este costo por actividad?', tone: 'error', confirmText: 'Eliminar' });
    if (!ok) return;
    setBusy(true);
    const { error } = await deleteActivityCost(id);
    if (error) {
      notify.error('Error eliminando el costo', { description: String(error) });
    } else {
      await refreshData();
    }
    setBusy(false);
  };

  // CÁLCULOS
  const totalCostPerUnit = costs.reduce((sum, item) => sum + Number(item.cost), 0);

  // Columnas del desglose de costos por guía (C3: DataTable virtualizado).
  // Se definen dentro del componente porque el costo depende de totalCostPerUnit.
  const receptionColumns: DataTableColumn<any>[] = [
    {
      id: 'fecha',
      header: 'Fecha Ingreso',
      width: 'minmax(140px,1fr)',
      cellClassName: 'text-slate-600 font-bold',
      cell: (rec) => rec.fecha_formateada || new Date(rec.created_at).toLocaleDateString(),
    },
    {
      id: 'sap',
      header: 'Documento SAP / Guía',
      width: 'minmax(160px,1fr)',
      cellClassName: 'font-mono font-black text-[#181c3a]',
      cell: (rec) => rec.sap_document || rec.guide_number || 'S/N',
    },
    {
      id: 'cliente',
      header: 'Cliente / Agencia',
      width: 'minmax(140px,1fr)',
      cellClassName: 'text-slate-500 font-bold',
      cell: (rec) => rec.carrier || rec.agency || '---',
    },
    {
      id: 'unidades',
      header: 'Equipos (Unidades)',
      width: '150px',
      align: 'center',
      cellClassName: 'font-black text-slate-800',
      cell: (rec) => rec.received_units || 0,
    },
    {
      id: 'costo',
      header: 'Costo Operativo Calculado',
      width: '200px',
      align: 'right',
      cellClassName: 'font-black text-rose-600',
      cell: (rec) => `$${((rec.received_units || 0) * totalCostPerUnit).toFixed(2)}`,
    },
  ];

  return (
    <ModulePage
      title="Análisis de Costos"
      category="Gestión Financiera"
    >
      {/* TABS NAVEGACIÓN */}
      <div className="flex items-center gap-4 mb-8 border-b border-slate-100">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'dashboard' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          <div className="flex items-center gap-2">
            <Calculator className="w-4 h-4" />
            Costos por Ingreso
          </div>
          {activeTab === 'dashboard' && <div className="absolute bottom-0 left-0 w-full h-1 bg-amber-500 rounded-t-full" />}
        </button>
        <button 
          onClick={() => setActiveTab('config')}
          className={`pb-4 px-2 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'config' ? 'text-[#181c3a]' : 'text-slate-300 hover:text-slate-400'}`}
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Configuración de Actividades
          </div>
          {activeTab === 'config' && <div className="absolute bottom-0 left-0 w-full h-1 bg-amber-500 rounded-t-full" />}
        </button>
      </div>

      {activeTab === 'dashboard' && (
        <div className="space-y-6 animate-rise-in">
          {/* KPI CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 border-l-4 border-l-amber-500">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500">
                  <CircleDollarSign size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Costo Base por Equipo</p>
                  <p className="text-2xl font-black text-[#181c3a]">${totalCostPerUnit.toFixed(2)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-6 border-l-4 border-l-emerald-500">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-500">
                  <TrendingUp size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ingresos Procesados</p>
                  <p className="text-2xl font-black text-[#181c3a]">{receptions.length}</p>
                </div>
              </div>
            </Card>
            <Card className="p-6 border-l-4 border-l-[#2ec4f1]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[#2ec4f1]/10 rounded-xl flex items-center justify-center text-[#2ec4f1]">
                  <FileText size={24} />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Costo Total Estimado</p>
                  <p className="text-2xl font-black text-[#181c3a]">
                    ${(receptions.reduce((acc: number, rec: any) => acc + (rec.received_units || 0), 0) * totalCostPerUnit).toFixed(2)}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          <Card padding="none" className="overflow-hidden border-2 border-slate-100 shadow-xl shadow-slate-200/50">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-widest">Desglose de Costos por Guía (Backoffice)</h3>
              <p className="text-xs text-slate-400">Calculado a ${totalCostPerUnit.toFixed(2)} por equipo</p>
            </div>
            {dashboardLoading ? (
              <div className="p-10 text-center text-slate-400">Cargando datos...</div>
            ) : (
              <DataTable
                columns={receptionColumns}
                data={receptions}
                getRowId={(rec) => rec.id}
                rowHeight={52}
                maxBodyHeight={560}
                minWidth={790}
                headerClassName="bg-[#181c3a]"
                headerTextClassName="text-white/40"
                emptyMessage="No hay registros de ingresos para costear."
              />
            )}
          </Card>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="grid lg:grid-cols-3 gap-8 animate-rise-in">
          <div className="lg:col-span-1">
            <Card className="p-6 border-2 border-slate-100 shadow-xl shadow-slate-200/50">
              <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-widest mb-6 border-b border-slate-100 pb-4">
                {editingId ? 'Editar Actividad' : 'Nueva Actividad'}
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Nombre de Actividad *</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="Ej. Limpieza General"
                    className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-amber-500 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Costo por Equipo ($) *</label>
                  <input 
                    type="number" 
                    step="0.01"
                    min="0"
                    value={formData.cost}
                    onChange={(e) => setFormData({...formData, cost: e.target.value})}
                    placeholder="0.00"
                    className="w-full h-12 px-4 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold text-[#181c3a] outline-none focus:border-amber-500 focus:bg-white transition-all font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 block mb-2">Descripción (Opcional)</label>
                  <textarea 
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    placeholder="Detalles sobre esta actividad..."
                    className="w-full h-24 p-4 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold text-[#181c3a] outline-none focus:border-amber-500 focus:bg-white transition-all resize-none"
                  />
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                {editingId && (
                  <Button variant="outline" className="flex-1 rounded-xl h-12" onClick={() => { setEditingId(null); setFormData({name:'', cost:'', description:''}); }}>
                    <X size={16} /> Cancelar
                  </Button>
                )}
                <Button 
                  disabled={busy}
                  className="flex-[2] bg-amber-500 hover:bg-amber-600 text-white rounded-xl h-12 font-black uppercase tracking-widest text-[10px] shadow-lg shadow-amber-500/20"
                  onClick={handleSave}
                >
                  <Save size={16} className="mr-2" />
                  {editingId ? 'Guardar Cambios' : 'Agregar Costo'}
                </Button>
              </div>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card padding="none" className="overflow-hidden border-2 border-slate-100 shadow-xl shadow-slate-200/50">
              <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="text-sm font-black text-[#181c3a] uppercase tracking-widest">Catálogo de Costos por Actividad</h3>
                <Badge className="bg-[#181c3a] text-white border-none font-black text-xs">Total: ${totalCostPerUnit.toFixed(2)}</Badge>
              </div>
              {loading ? (
                <div className="p-10 text-center text-slate-400">Cargando...</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#181c3a] text-white/40 text-[10px] font-black uppercase tracking-widest">
                      <th className="px-6 py-4">Actividad</th>
                      <th className="px-6 py-4 hidden md:table-cell">Descripción</th>
                      <th className="px-6 py-4 text-right">Costo Unitario</th>
                      <th className="px-6 py-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {costs.length > 0 ? costs.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-black text-[#181c3a]">{item.name}</td>
                        <td className="px-6 py-4 text-slate-500 hidden md:table-cell">{item.description || '---'}</td>
                        <td className="px-6 py-4 text-right font-black font-mono text-amber-600">${Number(item.cost).toFixed(2)}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center gap-3">
                            <button 
                              onClick={() => handleEdit(item)}
                              className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-amber-500 hover:border-amber-500 transition-all shadow-sm"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button 
                              onClick={() => handleDelete(item.id)}
                              className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-rose-500 hover:border-rose-500 transition-all shadow-sm"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-slate-400 italic">No hay actividades configuradas.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </div>
      )}
    </ModulePage>
  );
}
