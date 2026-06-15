"use client";

import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Settings, Save, Clock, AlertCircle, Speaker, ShieldAlert, History, GitCommit, RotateCcw, Copy, Eye, CheckCircle2, ChevronRight, CheckSquare, Plus, X } from 'lucide-react';

const ListEditor = ({ name, title, defaultOptions, settings, setSettings }: any) => {
  const list = settings[name] || defaultOptions;
  const [newValue, setNewValue] = useState('');

  const handleAdd = () => {
    if (!newValue.trim()) return;
    setSettings({ ...settings, [name]: [...list, newValue.trim()] });
    setNewValue('');
  };

  const handleRemove = (idx: number) => {
    const newList = [...list];
    newList.splice(idx, 1);
    setSettings({ ...settings, [name]: newList });
  };

  return (
    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col h-full">
      <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase">{title}</label>
      <div className="flex gap-2 mb-3">
        <input 
          type="text" 
          value={newValue} 
          onChange={(e) => setNewValue(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Nueva opción..." 
          className="flex-1 bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-800 text-sm font-semibold focus:ring-2 focus:ring-[#2ec4f1] outline-none" 
        />
        <button onClick={handleAdd} className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-2 rounded-lg text-sm font-bold transition-colors flex items-center justify-center">
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="space-y-2 overflow-y-auto pr-2 flex-1 max-h-48">
        {list.map((opt: string, idx: number) => (
          <div key={idx} className="flex justify-between items-center bg-white border border-slate-100 px-3 py-2 rounded-lg shadow-sm group">
            <span className="text-sm font-medium text-slate-700">{opt}</span>
            <button onClick={() => handleRemove(idx)} className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        {list.length === 0 && <p className="text-xs text-slate-400 text-center italic mt-4">No hay opciones configuradas.</p>}
      </div>
    </div>
  );
};

export default function ConfiguracionPoliticasTab() {
  const [activePolicy, setActivePolicy] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  
  // Settings edit state
  const [settings, setSettings] = useState<any>({});
  
  // Modal state
  const [diffModalOpen, setDiffModalOpen] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    
    // Fetch active policy
    const { data: activeData } = await supabase
      .from('hr_policies_versions')
      .select('*')
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single();
      
    if (activeData) {
      setActivePolicy(activeData);
      setSettings(activeData.settings);
    } else {
      // Create empty state if none exists (fallback if DB script wasn't run right)
      setSettings({
        horario_desayuno_inicio: "08:00",
        horario_desayuno_fin: "11:00",
        horario_almuerzo_inicio: "12:00",
        horario_almuerzo_fin: "15:00",
        horario_permiso_inicio: "00:00",
        horario_permiso_fin: "23:59",
        tolerancia_ingreso_min: 10,
        tolerancia_salida_min: 10,
        duracion_desayuno_min: 15,
        duracion_almuerzo_min: 60,
        gracia_recesos_min: 5,
        regla_permitir_desayuno_tarde: true,
        regla_permitir_almuerzo_tarde: true,
        regla_calcular_horas_extra: true,
        regla_descontar_almuerzo: false,
        regla_solicitar_justificacion_receso: true,
        regla_doble_marcaje: false,
        regla_confirmacion_salida: false,
        kiosko_mensaje_bienvenida: "Bienvenido a Tech Corps Guatemala",
        kiosko_voz_activa: true,
        permitir_marcaje_especial: true,
        justificaciones_llegada_tarde: ["Tráfico", "Transporte público", "Cita médica", "Emergencia familiar", "Otros"],
        justificaciones_exceso_desayuno: ["Atención a cliente", "Reunión", "Demora en servicio", "Problema operativo", "Otros"],
        justificaciones_exceso_almuerzo: ["Atención a cliente", "Reunión", "Demora en servicio", "Problema operativo", "Otros"],
        justificaciones_salida_anticipada: ["Salud", "Emergencia", "Permiso autorizado", "Comisión laboral", "Otros"],
        justificaciones_marcaje_especial: ["Reingreso a Laborar", "Trabajo Extraordinario", "Capacitación", "Emergencia", "Comisión Externa", "Otros"]
      });
    }

    // Fetch history
    const { data: historyData } = await supabase
      .from('hr_policies_versions')
      .select('*')
      .order('version', { ascending: false });
      
    if (historyData) {
      setHistory(historyData);
    }
    
    setLoading(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    let finalValue: any = value;
    
    if (type === 'checkbox') {
      finalValue = (e.target as HTMLInputElement).checked;
    } else if (type === 'number') {
      finalValue = parseInt(value, 10);
      if (isNaN(finalValue)) finalValue = '';
    } else if (e.target.tagName.toLowerCase() === 'textarea') {
      // Parse textarea value into an array of strings, splitting by newline, trimming whitespace, and filtering out empty lines
      finalValue = value.split('\n').map(s => s.trim()).filter(s => s !== '');
    }

    setSettings({ ...settings, [name]: finalValue });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    try {
      // 1. Get current user for audit
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const userName = session?.user?.user_metadata?.full_name || session?.user?.email || 'Administrador';

      // 2. Determine new version number
      const newVersion = activePolicy ? activePolicy.version + 1 : 1;

      // 3. Deactivate old active policy
      if (activePolicy) {
        await supabase
          .from('hr_policies_versions')
          .update({ is_active: false })
          .eq('id', activePolicy.id);
      }

      // 4. Insert new policy
      const { error } = await supabase
        .from('hr_policies_versions')
        .insert({
          version: newVersion,
          is_active: true,
          created_by: userId,
          created_by_name: userName,
          settings: settings
        });

      if (error) throw error;

      setMessage('Políticas actualizadas exitosamente (Nueva Versión).');
      await fetchData(); // Reload to get fresh data
      
      setTimeout(() => setMessage(''), 3000);
    } catch (error: any) {
      console.error('Save error detailed:', error);
      const errorMsg = error?.message || error?.details || JSON.stringify(error);
      setMessage(`Error al guardar las políticas: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRestore = async (versionToRestore: any) => {
    if (!window.confirm(`¿Estás seguro de restaurar los ajustes de la versión ${versionToRestore.version}? Esto creará una nueva versión activa.`)) return;
    
    setSaving(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const userName = session?.user?.user_metadata?.full_name || session?.user?.email || 'Administrador';

      const newVersion = history[0].version + 1;

      // Deactivate current
      if (activePolicy) {
        await supabase.from('hr_policies_versions').update({ is_active: false }).eq('id', activePolicy.id);
      }

      // Insert new version based on restored settings
      await supabase.from('hr_policies_versions').insert({
        version: newVersion,
        is_active: true,
        created_by: userId,
        created_by_name: `${userName} (Restaurado v${versionToRestore.version})`,
        settings: versionToRestore.settings
      });

      setMessage(`Versión ${versionToRestore.version} restaurada exitosamente.`);
      await fetchData();
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error(error);
      setMessage('Error al restaurar.');
    } finally {
      setSaving(false);
    }
  };

  const openDiffModal = (ver: any) => {
    setSelectedVersion(ver);
    setDiffModalOpen(true);
  };

  const getDifferences = (currentSettings: any, previousSettings: any) => {
    const diffs: any[] = [];
    const allKeys = new Set([...Object.keys(currentSettings), ...Object.keys(previousSettings || {})]);
    
    allKeys.forEach(key => {
      const oldVal = previousSettings ? previousSettings[key] : undefined;
      const newVal = currentSettings[key];
      if (oldVal !== newVal) {
        diffs.push({ key, oldVal, newVal });
      }
    });
    return diffs;
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse font-bold">Cargando políticas...</div>;

  return (
    <div className="bg-slate-50 min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* HEADER */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center">
              <Settings className="w-6 h-6 text-[#2ec4f1]" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Políticas Generales</h2>
              <p className="text-slate-500 font-medium mt-1">Configuración del Kiosko Biométrico centralizada.</p>
            </div>
          </div>
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-[#2ec4f1] hover:bg-[#2ec4f1]/80 text-slate-900 font-black uppercase tracking-widest text-sm rounded-xl transition-all shadow-lg shadow-[#2ec4f1]/20 disabled:opacity-50"
          >
            {saving ? <Clock className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Guardar Cambios
          </button>
        </div>

        {message && (
          <div className={`p-4 rounded-xl font-bold flex items-center gap-2 shadow-sm ${message.includes('Error') ? 'bg-rose-50 border border-rose-100 text-rose-600' : 'bg-emerald-50 border border-emerald-100 text-emerald-600'}`}>
            <AlertCircle className="w-5 h-5" />
            {message}
          </div>
        )}

        {/* ACTIVE POLICY BANNER */}
        {activePolicy && (
          <div className="bg-emerald-500 text-white p-4 rounded-2xl flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6" />
              <div>
                <p className="font-bold text-sm">Política actualmente activa (Versión #{activePolicy.version})</p>
                <p className="text-emerald-100 text-xs mt-0.5">Editada por {activePolicy.created_by_name || 'Sistema'} el {new Date(activePolicy.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <span className="px-3 py-1 bg-emerald-600 rounded-lg text-xs font-black tracking-widest">ACTIVA</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* COLUMN 1: HORARIOS */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Clock className="w-5 h-5 text-indigo-500" />
              <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm">Horarios Permitidos</h3>
            </div>
            
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Desayuno</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Hora inicio</label>
                    <input type="time" name="horario_desayuno_inicio" value={settings.horario_desayuno_inicio || '08:00'} onChange={handleChange} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Hora fin</label>
                    <input type="time" name="horario_desayuno_fin" value={settings.horario_desayuno_fin || '11:00'} onChange={handleChange} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Almuerzo</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Hora inicio</label>
                    <input type="time" name="horario_almuerzo_inicio" value={settings.horario_almuerzo_inicio || '12:00'} onChange={handleChange} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Hora fin</label>
                    <input type="time" name="horario_almuerzo_fin" value={settings.horario_almuerzo_fin || '15:00'} onChange={handleChange} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wider">Permisos Especiales</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Hora inicio</label>
                    <input type="time" name="horario_permiso_inicio" value={settings.horario_permiso_inicio || '00:00'} onChange={handleChange} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Hora fin</label>
                    <input type="time" name="horario_permiso_fin" value={settings.horario_permiso_fin || '23:59'} onChange={handleChange} className="w-full bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-800 font-bold focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 2: MÁRGENES */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <Clock className="w-5 h-5 text-amber-500" />
              <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm">Márgenes Automáticos</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div>
                  <p className="font-bold text-sm text-slate-800">Tolerancia Ingreso</p>
                  <p className="text-[10px] text-slate-500 uppercase mt-1">Minutos antes de marcar tarde</p>
                </div>
                <input type="number" name="tolerancia_ingreso_min" value={settings.tolerancia_ingreso_min || 10} onChange={handleChange} className="w-20 bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-800 font-bold text-center outline-none" />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div>
                  <p className="font-bold text-sm text-slate-800">Salida Anticipada</p>
                  <p className="text-[10px] text-slate-500 uppercase mt-1">Minutos permitidos antes de turno</p>
                </div>
                <input type="number" name="tolerancia_salida_min" value={settings.tolerancia_salida_min || 10} onChange={handleChange} className="w-20 bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-800 font-bold text-center outline-none" />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div>
                  <p className="font-bold text-sm text-slate-800">Gracia en Recesos</p>
                  <p className="text-[10px] text-slate-500 uppercase mt-1">Exceso antes de justificar</p>
                </div>
                <input type="number" name="gracia_recesos_min" value={settings.gracia_recesos_min || 5} onChange={handleChange} className="w-20 bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-800 font-bold text-center outline-none" />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div>
                  <p className="font-bold text-sm text-slate-800">Duración Desayuno</p>
                  <p className="text-[10px] text-slate-500 uppercase mt-1">Tiempo asignado base (min)</p>
                </div>
                <input type="number" name="duracion_desayuno_min" value={settings.duracion_desayuno_min || 15} onChange={handleChange} className="w-20 bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-800 font-bold text-center outline-none" />
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl">
                <div>
                  <p className="font-bold text-sm text-slate-800">Duración Almuerzo</p>
                  <p className="text-[10px] text-slate-500 uppercase mt-1">Tiempo asignado base (min)</p>
                </div>
                <input type="number" name="duracion_almuerzo_min" value={settings.duracion_almuerzo_min || 60} onChange={handleChange} className="w-20 bg-white border border-slate-200 px-3 py-2 rounded-lg text-slate-800 font-bold text-center outline-none" />
              </div>
            </div>
          </div>

          {/* COLUMN 3: REGLAS */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <CheckSquare className="w-5 h-5 text-emerald-500" />
              <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm">Reglas Automáticas</h3>
            </div>
            
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                <input type="checkbox" name="regla_calcular_horas_extra" checked={settings.regla_calcular_horas_extra || false} onChange={handleChange} className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">Calcular Horas Extras</span>
              </label>

              <label className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                <input type="checkbox" name="regla_descontar_almuerzo" checked={settings.regla_descontar_almuerzo || false} onChange={handleChange} className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">Descontar almuerzo automáticamente</span>
              </label>

              <label className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                <input type="checkbox" name="regla_solicitar_justificacion_receso" checked={settings.regla_solicitar_justificacion_receso !== false} onChange={handleChange} className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">Solicitar justificación si excede el receso</span>
              </label>

              <label className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                <input type="checkbox" name="regla_doble_marcaje" checked={settings.regla_doble_marcaje || false} onChange={handleChange} className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">Permitir doble marcaje (sin bloqueo)</span>
              </label>

              <label className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                <input type="checkbox" name="regla_confirmacion_salida" checked={settings.regla_confirmacion_salida || false} onChange={handleChange} className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">Mostrar confirmación antes de salir</span>
              </label>

              <label className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                <input type="checkbox" name="regla_permitir_desayuno_tarde" checked={settings.regla_permitir_desayuno_tarde || false} onChange={handleChange} className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">Permitir desayuno fuera del horario</span>
              </label>
              
              <label className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                <input type="checkbox" name="permitir_marcaje_especial" checked={settings.permitir_marcaje_especial || false} onChange={handleChange} className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">Botón de Marcaje Especial (Kiosko)</span>
              </label>

              <label className="flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer transition-colors border border-transparent hover:border-slate-100">
                <input type="checkbox" name="kiosko_voz_activa" checked={settings.kiosko_voz_activa || false} onChange={handleChange} className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500" />
                <span className="text-sm font-semibold text-slate-700">Síntesis de Voz (TTS) en Kiosko</span>
              </label>
            </div>
            
            <div className="pt-4 border-t border-slate-100">
              <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Mensaje de Bienvenida Kiosko</label>
              <input type="text" name="kiosko_mensaje_bienvenida" value={settings.kiosko_mensaje_bienvenida || ''} onChange={handleChange} className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-lg text-slate-800 font-semibold focus:ring-2 focus:ring-emerald-500 outline-none" />
            </div>
          </div>
        </div>

        {/* SECCIÓN LISTAS DE JUSTIFICACIONES */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mt-8 space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
            <Settings className="w-5 h-5 text-purple-500" />
            <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm">Opciones de Justificación (Kiosko)</h3>
          </div>
          <p className="text-sm text-slate-500 mb-4">Agregue o elimine las opciones disponibles para cada tipo de incidencia. Estas se mostrarán al empleado en el reloj marcador.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ListEditor 
              name="justificaciones_llegada_tarde" 
              title="Llegada Tarde" 
              defaultOptions={["Tráfico", "Transporte público", "Cita médica", "Emergencia familiar", "Otros"]}
              settings={settings}
              setSettings={setSettings}
            />

            <ListEditor 
              name="justificaciones_exceso_desayuno" 
              title="Exceso de Desayuno (Refacción)" 
              defaultOptions={["Atención a cliente", "Reunión", "Demora en servicio", "Problema operativo", "Otros"]}
              settings={settings}
              setSettings={setSettings}
            />

            <ListEditor 
              name="justificaciones_exceso_almuerzo" 
              title="Exceso de Almuerzo" 
              defaultOptions={["Atención a cliente", "Reunión", "Demora en servicio", "Problema operativo", "Otros"]}
              settings={settings}
              setSettings={setSettings}
            />

            <ListEditor 
              name="justificaciones_salida_anticipada" 
              title="Salida Anticipada" 
              defaultOptions={["Salud", "Emergencia", "Permiso autorizado", "Comisión laboral", "Otros"]}
              settings={settings}
              setSettings={setSettings}
            />

            <ListEditor 
              name="justificaciones_marcaje_especial" 
              title="Marcaje Especial" 
              defaultOptions={["Reingreso a Laborar", "Trabajo Extraordinario", "Capacitación", "Emergencia", "Comisión Externa", "Otros"]}
              settings={settings}
              setSettings={setSettings}
            />
          </div>
          
          <div className="flex justify-end mt-6 pt-6 border-t border-slate-100">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-[#2ec4f1] hover:bg-[#2ec4f1]/80 text-slate-900 font-black uppercase tracking-widest text-sm rounded-xl transition-all shadow-lg shadow-[#2ec4f1]/20 disabled:opacity-50"
            >
              {saving ? <Clock className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Guardar Opciones
            </button>
          </div>
        </div>

        {/* HISTORIAL */}
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm mt-8">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-4 mb-6">
            <History className="w-5 h-5 text-slate-800" />
            <h3 className="font-black text-slate-800 uppercase tracking-wider text-sm">Historial de Políticas</h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold">
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Versión</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right rounded-r-lg">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((ver, idx) => (
                  <tr key={ver.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <GitCommit className="w-4 h-4 text-slate-400" />
                        #{ver.version}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-slate-600 font-medium">
                      {new Date(ver.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-slate-600 font-medium">
                      {ver.created_by_name || 'Desconocido'}
                    </td>
                    <td className="px-4 py-4">
                      {ver.is_active ? (
                        <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider">Activa</span>
                      ) : (
                        <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider">Histórica</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openDiffModal(ver)} className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors">
                          <Eye className="w-3.5 h-3.5" /> Ver diff
                        </button>
                        {!ver.is_active && (
                          <button onClick={() => handleRestore(ver)} className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-xs font-bold transition-colors">
                            <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL DE DIFERENCIAS */}
      {diffModalOpen && selectedVersion && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-xl font-black text-slate-900">Diferencias de Versión #{selectedVersion.version}</h3>
                <p className="text-sm text-slate-500 font-medium">Comparado con la versión inmediatamente anterior.</p>
              </div>
              <button onClick={() => setDiffModalOpen(false)} className="w-8 h-8 flex items-center justify-center bg-slate-200 hover:bg-slate-300 rounded-full text-slate-700 transition-colors">
                ✕
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              {(() => {
                // Find previous version
                const sortedHistory = [...history].sort((a, b) => a.version - b.version);
                const prevVerIndex = sortedHistory.findIndex(v => v.version === selectedVersion.version) - 1;
                const prevVer = prevVerIndex >= 0 ? sortedHistory[prevVerIndex] : null;
                
                const diffs = getDifferences(selectedVersion.settings, prevVer?.settings || {});
                
                if (diffs.length === 0) {
                  return <p className="text-center text-slate-500 py-8 font-medium">No hay diferencias con la versión anterior (o es la primera versión).</p>;
                }

                return (
                  <div className="space-y-3">
                    {diffs.map((d, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <span className="font-bold text-slate-700">{d.key}</span>
                        <div className="flex items-center gap-3 text-sm font-medium">
                          <span className="px-3 py-1 bg-rose-100 text-rose-700 rounded-md line-through opacity-70">
                            {d.oldVal !== undefined ? String(d.oldVal) : 'null'}
                          </span>
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                          <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-md">
                            {String(d.newVal)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setDiffModalOpen(false)} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
