"use client";

import { useState, useEffect } from 'react';
import { HR_POLICY_VERSION_SELECT } from '@/shared/constants/dbProjections';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { confirmDialog, Card, Button } from '@/components/ui';
import { erpFieldClass, erpLabelClass, erpSoftStat, erpTableHeader, erpTableHeaderText } from '@/lib/design/tokens';
import { Settings, Save, Clock, AlertCircle, Speaker, ShieldAlert, History, GitCommit, RotateCcw, Copy, Eye, CheckCircle2, ChevronRight, CheckSquare, Plus, X } from 'lucide-react';

const uniqueJustificationOptions = (options: string[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of options || []) {
    const opt = String(raw || '').trim();
    if (!opt) continue;
    const key = opt.toLocaleLowerCase('es');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(opt);
  }
  return out;
};

const ListEditor = ({ name, title, defaultOptions, settings, setSettings }: any) => {
  const list = uniqueJustificationOptions(settings[name] || defaultOptions);
  const [newValue, setNewValue] = useState('');

  const handleAdd = () => {
    const next = newValue.trim();
    if (!next) return;
    const exists = list.some((opt) => opt.toLocaleLowerCase('es') === next.toLocaleLowerCase('es'));
    if (exists) {
      setNewValue('');
      return;
    }
    setSettings({ ...settings, [name]: [...list, next] });
    setNewValue('');
  };

  const handleRemove = (idx: number) => {
    const newList = [...list];
    newList.splice(idx, 1);
    setSettings({ ...settings, [name]: newList });
  };

  return (
    <div className="bg-[var(--surface-hover)] border border-[var(--border)] p-4 rounded-xl flex flex-col h-full">
      <label className={`block mb-2 ${erpLabelClass}`}>{title}</label>
      <div className="flex gap-2 mb-3">
        <input 
          type="text" 
          value={newValue} 
          onChange={(e) => setNewValue(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Nueva opción..." 
          className={`flex-1 ${erpFieldClass}`}
        />
        <Button type="button" onClick={handleAdd} variant="primary" size="sm" className="px-3">
          <Plus className="w-4 h-4" />
        </Button>
      </div>
      <div className="space-y-2 overflow-y-auto pr-2 flex-1 max-h-48">
        {list.map((opt: string, idx: number) => (
          <div key={`${opt}-${idx}`} className="flex justify-between items-center bg-[var(--surface)] border border-[var(--border)] px-3 py-2 rounded-lg shadow-sm group">
            <span className="text-sm font-medium text-[var(--foreground)]">{opt}</span>
            <button onClick={() => handleRemove(idx)} className="text-[var(--muted)] hover:text-[var(--danger)] transition-colors opacity-0 group-hover:opacity-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        {list.length === 0 && <p className="text-xs text-[var(--muted)] text-center italic mt-4">No hay opciones configuradas.</p>}
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
      .select(HR_POLICY_VERSION_SELECT)
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
      .select(HR_POLICY_VERSION_SELECT)
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

      // 4. Insert new policy (dedupe listas de justificación)
      const justificationKeys = [
        'justificaciones_llegada_tarde',
        'justificaciones_exceso_desayuno',
        'justificaciones_exceso_almuerzo',
        'justificaciones_salida_anticipada',
        'justificaciones_marcaje_especial',
      ] as const;
      const cleanedSettings = { ...settings };
      for (const key of justificationKeys) {
        if (Array.isArray(cleanedSettings[key])) {
          cleanedSettings[key] = uniqueJustificationOptions(cleanedSettings[key]);
        }
      }

      const { error } = await supabase
        .from('hr_policies_versions')
        .insert({
          version: newVersion,
          is_active: true,
          created_by: userId,
          created_by_name: userName,
          settings: cleanedSettings
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
    const ok = await confirmDialog({
      title: 'Restaurar versión',
      message: `¿Estás seguro de restaurar los ajustes de la versión ${versionToRestore.version}? Esto creará una nueva versión activa.`,
      confirmText: 'Restaurar',
    });
    if (!ok) return;
    
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

  if (loading) return <div className="p-8 text-center text-[var(--muted)] animate-pulse font-bold">Cargando políticas...</div>;

  return (
    <div className="bg-[var(--surface-hover)] min-h-screen p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* HEADER */}
        <Card className="p-6 border border-[var(--border)] shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[var(--primary)] rounded-2xl flex items-center justify-center">
              <Settings className="w-6 h-6 text-[var(--accent)]" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-[var(--heading)] tracking-tight">Políticas Generales</h2>
              <p className="text-[var(--muted)] font-medium mt-1">Configuración del Kiosko Biométrico centralizada.</p>
            </div>
          </div>
          <Button 
            onClick={handleSave}
            disabled={saving}
            variant="primary"
            size="md"
            isLoading={saving}
            leftIcon={!saving ? <Save className="w-5 h-5" /> : undefined}
            className="uppercase tracking-widest text-sm"
          >
            Guardar Cambios
          </Button>
        </Card>

        {message && (
          <div className={`p-4 rounded-xl font-bold flex items-center gap-2 shadow-sm ${message.includes('Error') ? erpSoftStat.danger : erpSoftStat.success}`}>
            <AlertCircle className="w-5 h-5" />
            {message}
          </div>
        )}

        {/* ACTIVE POLICY BANNER */}
        {activePolicy && (
          <div className={`${erpSoftStat.success} p-4 rounded-2xl flex items-center justify-between shadow-sm`}>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6" />
              <div>
                <p className="font-bold text-sm">Política actualmente activa (Versión #{activePolicy.version})</p>
                <p className="text-xs mt-0.5 opacity-80">Editada por {activePolicy.created_by_name || 'Sistema'} el {new Date(activePolicy.created_at).toLocaleDateString()}</p>
              </div>
            </div>
            <span className="px-3 py-1 rounded-lg text-xs font-black tracking-widest border border-[var(--success)]/40 bg-[var(--success)]/20">ACTIVA</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* COLUMN 1: HORARIOS */}
          <Card className="p-6 border border-[var(--border)] shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4">
              <Clock className="w-5 h-5 text-[var(--accent)]" />
              <h3 className="font-black text-[var(--heading)] uppercase tracking-wider text-sm">Horarios Permitidos</h3>
            </div>
            
            <div className="space-y-4">
              <div className="bg-[var(--surface-hover)] p-4 rounded-xl border border-[var(--border)]">
                <p className={`${erpLabelClass} mb-3`}>Desayuno</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block mb-1 ${erpLabelClass}`}>Hora inicio</label>
                    <input type="time" name="horario_desayuno_inicio" value={settings.horario_desayuno_inicio || '08:00'} onChange={handleChange} className={erpFieldClass} />
                  </div>
                  <div>
                    <label className={`block mb-1 ${erpLabelClass}`}>Hora fin</label>
                    <input type="time" name="horario_desayuno_fin" value={settings.horario_desayuno_fin || '11:00'} onChange={handleChange} className={erpFieldClass} />
                  </div>
                </div>
              </div>

              <div className="bg-[var(--surface-hover)] p-4 rounded-xl border border-[var(--border)]">
                <p className={`${erpLabelClass} mb-3`}>Almuerzo</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block mb-1 ${erpLabelClass}`}>Hora inicio</label>
                    <input type="time" name="horario_almuerzo_inicio" value={settings.horario_almuerzo_inicio || '12:00'} onChange={handleChange} className={erpFieldClass} />
                  </div>
                  <div>
                    <label className={`block mb-1 ${erpLabelClass}`}>Hora fin</label>
                    <input type="time" name="horario_almuerzo_fin" value={settings.horario_almuerzo_fin || '15:00'} onChange={handleChange} className={erpFieldClass} />
                  </div>
                </div>
              </div>

              <div className="bg-[var(--surface-hover)] p-4 rounded-xl border border-[var(--border)]">
                <p className={`${erpLabelClass} mb-3`}>Permisos Especiales</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block mb-1 ${erpLabelClass}`}>Hora inicio</label>
                    <input type="time" name="horario_permiso_inicio" value={settings.horario_permiso_inicio || '00:00'} onChange={handleChange} className={erpFieldClass} />
                  </div>
                  <div>
                    <label className={`block mb-1 ${erpLabelClass}`}>Hora fin</label>
                    <input type="time" name="horario_permiso_fin" value={settings.horario_permiso_fin || '23:59'} onChange={handleChange} className={erpFieldClass} />
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* COLUMN 2: MÁRGENES */}
          <Card className="p-6 border border-[var(--border)] shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4">
              <Clock className="w-5 h-5 text-[var(--warning)]" />
              <h3 className="font-black text-[var(--heading)] uppercase tracking-wider text-sm">Márgenes Automáticos</h3>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl">
                <div>
                  <p className="font-bold text-sm text-[var(--foreground)]">Tolerancia Ingreso</p>
                  <p className={`${erpLabelClass} mt-1 normal-case tracking-normal`}>Minutos antes de marcar tarde</p>
                </div>
                <input type="number" name="tolerancia_ingreso_min" value={settings.tolerancia_ingreso_min || 10} onChange={handleChange} className={`w-20 text-center ${erpFieldClass}`} />
              </div>

              <div className="flex items-center justify-between p-4 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl">
                <div>
                  <p className="font-bold text-sm text-[var(--foreground)]">Salida Anticipada</p>
                  <p className={`${erpLabelClass} mt-1 normal-case tracking-normal`}>Minutos permitidos antes de turno</p>
                </div>
                <input type="number" name="tolerancia_salida_min" value={settings.tolerancia_salida_min || 10} onChange={handleChange} className={`w-20 text-center ${erpFieldClass}`} />
              </div>

              <div className="flex items-center justify-between p-4 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl">
                <div>
                  <p className="font-bold text-sm text-[var(--foreground)]">Gracia en Recesos</p>
                  <p className={`${erpLabelClass} mt-1 normal-case tracking-normal`}>Exceso antes de justificar</p>
                </div>
                <input type="number" name="gracia_recesos_min" value={settings.gracia_recesos_min || 5} onChange={handleChange} className={`w-20 text-center ${erpFieldClass}`} />
              </div>

              <div className="flex items-center justify-between p-4 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl">
                <div>
                  <p className="font-bold text-sm text-[var(--foreground)]">Duración Desayuno</p>
                  <p className={`${erpLabelClass} mt-1 normal-case tracking-normal`}>Tiempo asignado base (min)</p>
                </div>
                <input type="number" name="duracion_desayuno_min" value={settings.duracion_desayuno_min || 15} onChange={handleChange} className={`w-20 text-center ${erpFieldClass}`} />
              </div>

              <div className="flex items-center justify-between p-4 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl">
                <div>
                  <p className="font-bold text-sm text-[var(--foreground)]">Duración Almuerzo</p>
                  <p className={`${erpLabelClass} mt-1 normal-case tracking-normal`}>Tiempo asignado base (min)</p>
                </div>
                <input type="number" name="duracion_almuerzo_min" value={settings.duracion_almuerzo_min || 60} onChange={handleChange} className={`w-20 text-center ${erpFieldClass}`} />
              </div>
            </div>
          </Card>

          {/* COLUMN 3: REGLAS */}
          <Card className="p-6 border border-[var(--border)] shadow-sm space-y-6">
            <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4">
              <CheckSquare className="w-5 h-5 text-[var(--success)]" />
              <h3 className="font-black text-[var(--heading)] uppercase tracking-wider text-sm">Reglas Automáticas</h3>
            </div>
            
            <div className="space-y-2">
              <label className="flex items-center gap-3 p-3 hover:bg-[var(--surface-hover)] rounded-xl cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]">
                <input type="checkbox" name="regla_calcular_horas_extra" checked={settings.regla_calcular_horas_extra || false} onChange={handleChange} className="w-5 h-5 rounded accent-[var(--success)]" />
                <span className="text-sm font-semibold text-[var(--foreground)]">Calcular Horas Extras</span>
              </label>

              <label className="flex items-center gap-3 p-3 hover:bg-[var(--surface-hover)] rounded-xl cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]">
                <input type="checkbox" name="regla_descontar_almuerzo" checked={settings.regla_descontar_almuerzo || false} onChange={handleChange} className="w-5 h-5 rounded accent-[var(--success)]" />
                <span className="text-sm font-semibold text-[var(--foreground)]">Descontar almuerzo automáticamente</span>
              </label>

              <label className="flex items-center gap-3 p-3 hover:bg-[var(--surface-hover)] rounded-xl cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]">
                <input type="checkbox" name="regla_solicitar_justificacion_receso" checked={settings.regla_solicitar_justificacion_receso !== false} onChange={handleChange} className="w-5 h-5 rounded accent-[var(--success)]" />
                <span className="text-sm font-semibold text-[var(--foreground)]">Solicitar justificación si excede el receso</span>
              </label>

              <label className="flex items-center gap-3 p-3 hover:bg-[var(--surface-hover)] rounded-xl cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]">
                <input type="checkbox" name="regla_doble_marcaje" checked={settings.regla_doble_marcaje || false} onChange={handleChange} className="w-5 h-5 rounded accent-[var(--success)]" />
                <span className="text-sm font-semibold text-[var(--foreground)]">Permitir doble marcaje (sin bloqueo)</span>
              </label>

              <label className="flex items-center gap-3 p-3 hover:bg-[var(--surface-hover)] rounded-xl cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]">
                <input type="checkbox" name="regla_confirmacion_salida" checked={settings.regla_confirmacion_salida || false} onChange={handleChange} className="w-5 h-5 rounded accent-[var(--success)]" />
                <span className="text-sm font-semibold text-[var(--foreground)]">Mostrar confirmación antes de salir</span>
              </label>

              <label className="flex items-center gap-3 p-3 hover:bg-[var(--surface-hover)] rounded-xl cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]">
                <input type="checkbox" name="regla_permitir_desayuno_tarde" checked={settings.regla_permitir_desayuno_tarde || false} onChange={handleChange} className="w-5 h-5 rounded accent-[var(--success)]" />
                <span className="text-sm font-semibold text-[var(--foreground)]">Permitir desayuno fuera del horario</span>
              </label>
              
              <label className="flex items-center gap-3 p-3 hover:bg-[var(--surface-hover)] rounded-xl cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]">
                <input type="checkbox" name="permitir_marcaje_especial" checked={settings.permitir_marcaje_especial || false} onChange={handleChange} className="w-5 h-5 rounded accent-[var(--success)]" />
                <span className="text-sm font-semibold text-[var(--foreground)]">Botón de Marcaje Especial (Kiosko)</span>
              </label>

              <label className="flex items-center gap-3 p-3 hover:bg-[var(--surface-hover)] rounded-xl cursor-pointer transition-colors border border-transparent hover:border-[var(--border)]">
                <input type="checkbox" name="kiosko_voz_activa" checked={settings.kiosko_voz_activa || false} onChange={handleChange} className="w-5 h-5 rounded accent-[var(--success)]" />
                <span className="text-sm font-semibold text-[var(--foreground)]">Síntesis de Voz (TTS) en Kiosko</span>
              </label>
            </div>
            
            <div className="pt-4 border-t border-[var(--border)]">
              <label className={`block mb-1 ${erpLabelClass}`}>Mensaje de Bienvenida Kiosko</label>
              <input type="text" name="kiosko_mensaje_bienvenida" value={settings.kiosko_mensaje_bienvenida || ''} onChange={handleChange} className={erpFieldClass} />
            </div>
          </Card>
        </div>

        {/* SECCIÓN LISTAS DE JUSTIFICACIONES */}
        <Card className="p-6 border border-[var(--border)] shadow-sm mt-8 space-y-6">
          <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4">
            <Settings className="w-5 h-5 text-[var(--accent)]" />
            <h3 className="font-black text-[var(--heading)] uppercase tracking-wider text-sm">Opciones de Justificación (Kiosko)</h3>
          </div>
          <p className="text-sm text-[var(--muted)] mb-4">Agregue o elimine las opciones disponibles para cada tipo de incidencia. Estas se mostrarán al empleado en el reloj marcador.</p>
          
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
          
          <div className="flex justify-end mt-6 pt-6 border-t border-[var(--border)]">
            <Button 
              onClick={handleSave}
              disabled={saving}
              variant="primary"
              isLoading={saving}
              leftIcon={!saving ? <Save className="w-5 h-5" /> : undefined}
              className="uppercase tracking-widest text-sm"
            >
              Guardar Opciones
            </Button>
          </div>
        </Card>

        {/* HISTORIAL */}
        <Card className="p-6 border border-[var(--border)] shadow-sm mt-8">
          <div className="flex items-center gap-2 border-b border-[var(--border)] pb-4 mb-6">
            <History className="w-5 h-5 text-[var(--foreground)]" />
            <h3 className="font-black text-[var(--heading)] uppercase tracking-wider text-sm">Historial de Políticas</h3>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className={`${erpTableHeader} ${erpTableHeaderText} text-xs uppercase tracking-wider font-bold`}>
                <tr>
                  <th className="px-4 py-3 rounded-l-lg">Versión</th>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3 text-right rounded-r-lg">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)]">
                {history.map((ver, idx) => (
                  <tr key={ver.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                    <td className="px-4 py-4 font-bold text-[var(--foreground)]">
                      <div className="flex items-center gap-2">
                        <GitCommit className="w-4 h-4 text-[var(--muted)]" />
                        #{ver.version}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[var(--muted)] font-medium">
                      {new Date(ver.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-4 text-[var(--muted)] font-medium">
                      {ver.created_by_name || 'Desconocido'}
                    </td>
                    <td className="px-4 py-4">
                      {ver.is_active ? (
                        <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${erpSoftStat.success}`}>Activa</span>
                      ) : (
                        <span className={`px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${erpSoftStat.muted}`}>Histórica</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={() => openDiffModal(ver)} className="text-xs gap-1">
                          <Eye className="w-3.5 h-3.5" /> Ver diff
                        </Button>
                        {!ver.is_active && (
                          <Button variant="outline" size="sm" onClick={() => handleRestore(ver)} className={`text-xs gap-1 ${erpSoftStat.warning}`}>
                            <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* MODAL DE DIFERENCIAS */}
      {diffModalOpen && selectedVersion && (
        <div className="fixed inset-0 z-50 bg-[var(--primary)]/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] text-[var(--foreground)]">
            <div className="p-6 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-hover)]">
              <div>
                <h3 className="text-xl font-black text-[var(--heading)]">Diferencias de Versión #{selectedVersion.version}</h3>
                <p className="text-sm text-[var(--muted)] font-medium">Comparado con la versión inmediatamente anterior.</p>
              </div>
              <button onClick={() => setDiffModalOpen(false)} className="w-8 h-8 flex items-center justify-center bg-[var(--surface-hover)] hover:bg-[var(--border)] rounded-full text-[var(--foreground)] transition-colors">
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
                  return <p className="text-center text-[var(--muted)] py-8 font-medium">No hay diferencias con la versión anterior (o es la primera versión).</p>;
                }

                return (
                  <div className="space-y-3">
                    {diffs.map((d, i) => (
                      <div key={i} className="flex items-center justify-between p-4 bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl">
                        <span className="font-bold text-[var(--foreground)]">{d.key}</span>
                        <div className="flex items-center gap-3 text-sm font-medium">
                          <span className={`px-3 py-1 rounded-md line-through opacity-70 ${erpSoftStat.danger}`}>
                            {d.oldVal !== undefined ? String(d.oldVal) : 'null'}
                          </span>
                          <ChevronRight className="w-4 h-4 text-[var(--muted)]" />
                          <span className={`px-3 py-1 rounded-md ${erpSoftStat.success}`}>
                            {String(d.newVal)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
            
            <div className="p-6 border-t border-[var(--border)] bg-[var(--surface-hover)] flex justify-end">
              <Button onClick={() => setDiffModalOpen(false)} variant="primary">
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
