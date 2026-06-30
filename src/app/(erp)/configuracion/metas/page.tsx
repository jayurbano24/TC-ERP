"use client";

import React, { useState, useEffect } from 'react';
import { Card, Button, Badge, notify, confirmDialog } from '@/components/ui';
import { ModulePage } from '@/components/module-page';
import { Settings, Plus, Save, Trash2, Edit2, Users, Target } from 'lucide-react';
import { getKpiGoals, saveKpiGoal, deleteKpiGoal } from '@/modules/kpi-analytics/client/kpiGoals';
import { getProfiles, getModels, getTechnologies } from '@/shared/catalogs/catalogs';

export default function MetasKpiPage() {
  const [goals, setGoals] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [technologies, setTechnologies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string>('new');
  const [formUserId, setFormUserId] = useState('');
  const [formStage, setFormStage] = useState('diagnostico');
  const [formTechId, setFormTechId] = useState('');
  const [formModelId, setFormModelId] = useState('');
  const [formDailyGoal, setFormDailyGoal] = useState<number>(0);
  const [formWeeklyGoal, setFormWeeklyGoal] = useState<number>(0);

  const STAGES = [
    { id: 'diagnostico', label: 'Diagnóstico' },
    { id: 'reparacion', label: 'Reparación' },
    { id: 'reacondicionado', label: 'Reacondicionado' },
    { id: 'qc', label: 'Control de Calidad' }
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [gData, pData, mData, tData] = await Promise.all([
      getKpiGoals(),
      getProfiles(),
      getModels(),
      getTechnologies()
    ]);
    setGoals(gData);
    setProfiles(pData);
    setModels(mData);
    setTechnologies(tData);
    setLoading(false);
  };

  const handleOpenModal = (goal: any = null) => {
    if (goal) {
      setEditingId(goal.id);
      setFormUserId(goal.user_id || '');
      setFormStage(goal.stage || 'diagnostico');
      setFormTechId(goal.technology_id || '');
      setFormModelId(goal.model_id || '');
      setFormDailyGoal(goal.daily_goal || 0);
      setFormWeeklyGoal(goal.weekly_goal || 0);
    } else {
      setEditingId('new');
      setFormUserId('');
      setFormStage('diagnostico');
      setFormTechId('');
      setFormModelId('');
      setFormDailyGoal(0);
      setFormWeeklyGoal(0);
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (formDailyGoal <= 0) return notify.warning("La meta diaria debe ser mayor a 0");

    await saveKpiGoal({
      id: editingId,
      user_id: formUserId || null,
      stage: formStage,
      technology_id: formTechId || null,
      model_id: formModelId || null,
      daily_goal: formDailyGoal,
      weekly_goal: formWeeklyGoal
    });
    setIsModalOpen(false);
    fetchData();
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ title: 'Eliminar meta', message: '¿Eliminar esta meta?', tone: 'error', confirmText: 'Eliminar' });
    if (!ok) return;
    await deleteKpiGoal(id);
    fetchData();
  };

  return (
    <ModulePage title="Configuración de Metas (KPIs)" subtitle="Gestiona las métricas de cumplimiento por técnico, etapa y modelo." category="Configuración">
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-black text-[#181c3a] flex items-center gap-2">
            <Target className="w-6 h-6 text-[#2ec4f1]" /> Metas de Productividad
          </h2>
          <Button onClick={() => handleOpenModal()} className="bg-[#2ec4f1] hover:bg-[#2ec4f1]/90 text-white font-bold px-4 py-2 rounded-xl">
            <Plus className="w-4 h-4 mr-2" /> Nueva Meta
          </Button>
        </div>

        <Card className="border-2 border-slate-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#181c3a] text-white uppercase text-[10px] font-black tracking-widest">
              <tr>
                <th className="px-4 py-3">Técnico</th>
                <th className="px-4 py-3">Etapa</th>
                <th className="px-4 py-3">Tecnología</th>
                <th className="px-4 py-3">Modelo</th>
                <th className="px-4 py-3 text-center">Meta Diaria</th>
                <th className="px-4 py-3 text-center">Meta Semanal</th>
                <th className="px-4 py-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-slate-400">Cargando metas...</td></tr>
              ) : goals.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center font-bold text-slate-400">No hay metas configuradas</td></tr>
              ) : goals.map((g) => (
                <tr key={g.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-bold text-[#181c3a]">{profiles.find(p => p.id === g.user_id)?.full_name || (g.user_id ? 'Desconocido' : '(Todos)')}</td>
                  <td className="px-4 py-3 uppercase text-xs font-black text-slate-500">{g.stage}</td>
                  <td className="px-4 py-3 text-xs">{technologies.find(t => t.id === g.technology_id)?.name || <Badge variant="slate">Cualquiera</Badge>}</td>
                  <td className="px-4 py-3 text-xs font-bold text-slate-600">{models.find(m => m.id === g.model_id)?.name || <Badge variant="slate">Cualquiera</Badge>}</td>
                  <td className="px-4 py-3 text-center font-black text-[#2ec4f1]">{g.daily_goal}</td>
                  <td className="px-4 py-3 text-center font-bold text-slate-400">{g.weekly_goal}</td>
                  <td className="px-4 py-3 text-center space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => handleOpenModal(g)}><Edit2 className="w-4 h-4 text-blue-500" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(g.id)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-[#181c3a]/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-lg p-6 bg-white rounded-2xl shadow-xl flex flex-col gap-4">
            <h3 className="text-lg font-black text-[#181c3a]">{editingId === 'new' ? 'Nueva Meta KPI' : 'Editar Meta'}</h3>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Técnico / Operador</label>
                <select value={formUserId} onChange={e => setFormUserId(e.target.value)} className="w-full mt-1 p-2 bg-slate-50 border-2 border-slate-100 rounded-lg focus:ring-0 focus:border-[#2ec4f1] outline-none text-sm font-bold">
                  <option value="">(Global) Todos los Técnicos</option>
                  {profiles.filter(p => p.is_active !== false).map(p => (
                    <option key={p.id} value={p.id}>{p.full_name} ({p.role})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Etapa (Proceso)</label>
                <select value={formStage} onChange={e => setFormStage(e.target.value)} className="w-full mt-1 p-2 bg-slate-50 border-2 border-slate-100 rounded-lg focus:ring-0 focus:border-[#2ec4f1] outline-none text-sm font-bold uppercase">
                  {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Tecnología (Opcional)</label>
                  <select value={formTechId} onChange={e => setFormTechId(e.target.value)} className="w-full mt-1 p-2 bg-slate-50 border-2 border-slate-100 rounded-lg outline-none text-sm">
                    <option value="">Cualquiera</option>
                    {technologies.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Modelo (Opcional)</label>
                  <select value={formModelId} onChange={e => setFormModelId(e.target.value)} className="w-full mt-1 p-2 bg-slate-50 border-2 border-slate-100 rounded-lg outline-none text-sm">
                    <option value="">Cualquiera</option>
                    {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Meta Diaria</label>
                  <input type="number" value={formDailyGoal} onChange={e => setFormDailyGoal(parseInt(e.target.value) || 0)} className="w-full mt-1 p-2 bg-slate-50 border-2 border-slate-100 rounded-lg outline-none font-black text-lg" />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-slate-500 tracking-wider">Meta Semanal</label>
                  <input type="number" value={formWeeklyGoal} onChange={e => setFormWeeklyGoal(parseInt(e.target.value) || 0)} className="w-full mt-1 p-2 bg-slate-50 border-2 border-slate-100 rounded-lg outline-none font-bold text-lg text-slate-500" />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} className="bg-[#2ec4f1] hover:bg-[#2ec4f1]/90 text-white font-bold">
                <Save className="w-4 h-4 mr-2" /> Guardar Meta
              </Button>
            </div>
          </Card>
        </div>
      )}
    </ModulePage>
  );
}
