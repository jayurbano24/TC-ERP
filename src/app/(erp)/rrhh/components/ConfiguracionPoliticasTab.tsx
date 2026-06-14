"use client";

import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Settings, Save, Clock, AlertCircle, Speaker, ShieldAlert } from 'lucide-react';

export default function ConfiguracionPoliticasTab() {
  const [policies, setPolicies] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchPolicies();
  }, []);

  const fetchPolicies = async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    
    // Si no existe política, obtenemos la primera o la insertaremos
    let { data } = await supabase.from('hr_policies').select('*').limit(1).single();
    
    if (!data) {
       // Insertar default
       const { data: newData } = await supabase.from('hr_policies').insert({
         tolerancia_ingreso_min: 10,
         tolerancia_salida_min: 10,
         duracion_desayuno_min: 15,
         duracion_almuerzo_min: 60,
         max_exceso_receso_min: 5,
         permitir_horas_extra: true,
         kiosko_voz_activa: true
       }).select().single();
       data = newData;
    }
    
    setPolicies(data);
    setLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (type === 'number') {
      finalValue = parseInt(value, 10);
      if (isNaN(finalValue)) finalValue = '';
    }

    setPolicies({ ...policies, [name]: finalValue });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    const supabase = getSupabaseBrowserClient();
    if (supabase && policies?.id) {
      const { error } = await supabase.from('hr_policies').update(policies).eq('id', policies.id);
      if (error) {
        setMessage('Error al guardar las políticas.');
      } else {
        setMessage('Políticas actualizadas exitosamente.');
        setTimeout(() => setMessage(''), 3000);
      }
    }
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse font-bold">Cargando políticas...</div>;

  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-100 pb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center">
            <Settings className="w-6 h-6 text-[#2ec4f1]" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Políticas Generales</h2>
            <p className="text-slate-500 font-medium mt-1">Configuración del comportamiento del Kiosko y Tolerancias de Tiempo.</p>
          </div>
        </div>
        <button 
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-[#2ec4f1] hover:bg-[#2ec4f1]/80 text-slate-900 font-black uppercase tracking-widest text-sm rounded-xl transition-all disabled:opacity-50"
        >
          {saving ? <Clock className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
          Guardar Cambios
        </button>
      </div>

      {message && (
        <div className={`p-4 mb-6 rounded-xl font-bold flex items-center gap-2 ${message.includes('Error') ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
          <AlertCircle className="w-5 h-5" />
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        
        {/* TOLERANCIAS Y TIEMPOS */}
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-6">
          <div className="flex items-center gap-2 mb-2 border-b border-slate-200 pb-2">
            <Clock className="w-5 h-5 text-amber-500" />
            <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm">Tolerancias y Tiempos</h3>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Tolerancia Ingreso (min)</label>
              <input type="number" name="tolerancia_ingreso_min" value={policies.tolerancia_ingreso_min} onChange={handleChange} className="w-full bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-[#2ec4f1] outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Tolerancia Salida (min)</label>
              <input type="number" name="tolerancia_salida_min" value={policies.tolerancia_salida_min} onChange={handleChange} className="w-full bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-[#2ec4f1] outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Duración Desayuno (min)</label>
              <input type="number" name="duracion_desayuno_min" value={policies.duracion_desayuno_min} onChange={handleChange} className="w-full bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-[#2ec4f1] outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Duración Almuerzo (min)</label>
              <input type="number" name="duracion_almuerzo_min" value={policies.duracion_almuerzo_min} onChange={handleChange} className="w-full bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-[#2ec4f1] outline-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Gracia en Recesos (min)</label>
            <p className="text-xs text-slate-400 mb-2 font-medium">Minutos adicionales permitidos antes de requerir justificación por exceso.</p>
            <input type="number" name="max_exceso_receso_min" value={policies.max_exceso_receso_min} onChange={handleChange} className="w-full bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-[#2ec4f1] outline-none" />
          </div>
        </div>

        {/* COMPORTAMIENTO KIOSKO */}
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-6">
          <div className="flex items-center gap-2 mb-2 border-b border-slate-200 pb-2">
            <ShieldAlert className="w-5 h-5 text-purple-500" />
            <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm">Comportamiento Kiosko</h3>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">Mensaje de Bienvenida</label>
            <input type="text" name="kiosko_mensaje_bienvenida" value={policies.kiosko_mensaje_bienvenida || ''} onChange={handleChange} className="w-full bg-white border border-slate-200 px-4 py-2 rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-[#2ec4f1] outline-none" />
          </div>

          <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl">
            <div className="flex items-center gap-3">
              <Speaker className="w-5 h-5 text-slate-400" />
              <div>
                <p className="font-bold text-sm text-slate-800">Síntesis de Voz (TTS)</p>
                <p className="text-xs text-slate-500">Saludar y confirmar marcajes en voz alta.</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" name="kiosko_voz_activa" checked={policies.kiosko_voz_activa} onChange={handleChange} className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2ec4f1]"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl">
            <div>
              <p className="font-bold text-sm text-slate-800">Marcaje Especial</p>
              <p className="text-xs text-slate-500">Botón para registrar permisos, comisiones, etc.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" name="permitir_marcaje_especial" checked={policies.permitir_marcaje_especial} onChange={handleChange} className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2ec4f1]"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl">
            <div>
              <p className="font-bold text-sm text-slate-800">Calcular Horas Extra</p>
              <p className="text-xs text-slate-500">Generar registros de extra silenciosos.</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" name="permitir_horas_extra" checked={policies.permitir_horas_extra} onChange={handleChange} className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#2ec4f1]"></div>
            </label>
          </div>

        </div>
      </div>
    </div>
  );
}
