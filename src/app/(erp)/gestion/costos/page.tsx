"use client";

import React, { useState, useEffect } from 'react';
import { Card, Button, Badge } from '@/components/ui';
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
import { getActivityCosts, saveActivityCost, deleteActivityCost, ActivityCost } from '@/lib/database/costs';
import { getReceptionsWithSeries } from '@/lib/database/receptions'; // To fetch backoffice records

export default function CostosPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'config'>('dashboard');
  const [costs, setCosts] = useState<ActivityCost[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Dashboard state
  const [receptions, setReceptions] = useState<any[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', cost: '', description: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setDashboardLoading(true);
    try {
      const data = await getActivityCosts();
      setCosts(data);
      
      const recs = await getReceptionsWithSeries();
      // Filter only those that have been processed through backoffice, 
      // or just show all for now since they are backoffice ingress.
      setReceptions(recs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setDashboardLoading(false);
    }
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
      alert("Nombre y Costo son requeridos");
      return;
    }
    
    setLoading(true);
    const { data, error } = await saveActivityCost({
      id: editingId || '',
      name: formData.name,
      cost: parseFloat(formData.cost) || 0,
      description: formData.description
    });
    
    if (error) {
      alert("Error guardando el costo: " + error);
    } else {
      await loadData();
      setEditingId(null);
      setFormData({ name: '', cost: '', description: '' });
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este costo por actividad?")) return;
    setLoading(true);
    const { error } = await deleteActivityCost(id);
    if (error) {
      alert("Error eliminando el costo: " + error);
    } else {
      await loadData();
    }
    setLoading(false);
  };

  // CÁLCULOS
  const totalCostPerUnit = costs.reduce((sum, item) => sum + Number(item.cost), 0);

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
                    ${(receptions.reduce((acc, rec) => acc + (rec.received_units || 0), 0) * totalCostPerUnit).toFixed(2)}
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
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead>
                    <tr className="bg-[#181c3a] text-white/40 text-[10px] font-black uppercase tracking-widest">
                      <th className="px-6 py-4">Fecha Ingreso</th>
                      <th className="px-6 py-4">Documento SAP / Guía</th>
                      <th className="px-6 py-4">Cliente / Agencia</th>
                      <th className="px-6 py-4 text-center">Equipos (Unidades)</th>
                      <th className="px-6 py-4 text-right">Costo Operativo Calculado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {receptions.length > 0 ? receptions.map(rec => {
                      const units = rec.received_units || 0;
                      const cost = units * totalCostPerUnit;
                      return (
                        <tr key={rec.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-slate-600 font-bold">{rec.fecha_formateada || new Date(rec.created_at).toLocaleDateString()}</td>
                          <td className="px-6 py-4 font-mono font-black text-[#181c3a]">{rec.sap_document || rec.guide_number || 'S/N'}</td>
                          <td className="px-6 py-4 text-slate-500 font-bold">{rec.carrier || rec.agency || '---'}</td>
                          <td className="px-6 py-4 text-center font-black text-slate-800">{units}</td>
                          <td className="px-6 py-4 text-right font-black text-rose-600">${cost.toFixed(2)}</td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center text-slate-400 italic">No hay registros de ingresos para costear.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                  disabled={loading}
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
