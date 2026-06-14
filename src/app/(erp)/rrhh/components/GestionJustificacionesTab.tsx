"use client";

import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { CheckCircle2, XCircle, Clock, Search, Filter } from 'lucide-react';

export default function GestionJustificacionesTab() {
  const [justifications, setJustifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJustifications();
  }, []);

  const fetchJustifications = async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { data, error } = await supabase
      .from('time_justifications')
      .select(`
        *,
        employees (nombre_completo, no_empleado),
        time_logs (timestamp, evento_detectado)
      `)
      .order('created_at', { ascending: false });

    if (data) setJustifications(data);
    setLoading(false);
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    // TODO: In a real app, capture current user ID for 'aprobado_por_supervisor_id' or 'cerrado_por_rrhh_id'
    const updateData: any = { estado: newStatus };
    
    await supabase.from('time_justifications').update(updateData).eq('id', id);
    fetchJustifications();
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse font-bold">Cargando justificaciones...</div>;

  return (
    <div className="bg-white p-8 rounded-[2rem] border border-slate-100 shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Gestión de Justificaciones</h2>
          <p className="text-slate-500 font-medium mt-1">Aprobación de tardanzas, horas extras y salidas anticipadas.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar empleado..." 
              className="pl-10 pr-4 py-2.5 bg-slate-50 border-none rounded-xl text-sm font-bold w-64 focus:ring-2 focus:ring-[#2ec4f1] transition-all"
            />
          </div>
          <button className="p-2.5 bg-slate-50 text-slate-600 rounded-xl hover:bg-slate-100 transition-colors">
            <Filter className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden border border-slate-100 rounded-2xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 text-slate-500 text-xs font-black uppercase tracking-widest border-b border-slate-100">
              <th className="p-4">Fecha / Hora</th>
              <th className="p-4">Empleado</th>
              <th className="p-4">Tipo de Excepción</th>
              <th className="p-4">Motivo (Empleado)</th>
              <th className="p-4">Minutos</th>
              <th className="p-4">Estado</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-sm font-medium">
            {justifications.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">No hay justificaciones pendientes.</td>
              </tr>
            ) : (
              justifications.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4">
                    <div className="text-slate-900 font-bold">{new Date(j.created_at).toLocaleDateString()}</div>
                    <div className="text-xs text-slate-500">{new Date(j.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-slate-900 font-bold">{j.employees?.nombre_completo}</div>
                    <div className="text-xs text-slate-500">ID: {j.employees?.no_empleado}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${
                      j.tipo === 'LLEGADA_TARDE' ? 'bg-amber-100 text-amber-700' :
                      j.tipo === 'HORA_EXTRA' ? 'bg-purple-100 text-purple-700' :
                      j.tipo === 'EXCESO_ALMUERZO' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {j.tipo.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-slate-600 max-w-xs truncate" title={j.motivo_empleado}>
                    {j.motivo_empleado || '-'}
                  </td>
                  <td className="p-4 font-bold text-slate-900">
                    {j.minutos_calculados} min
                  </td>
                  <td className="p-4">
                    <span className={`flex items-center gap-1.5 text-xs font-bold ${
                      j.estado === 'PENDIENTE' ? 'text-amber-500' :
                      j.estado === 'APROBADA_SUPERVISOR' ? 'text-emerald-500' :
                      j.estado === 'RECHAZADA' ? 'text-rose-500' :
                      'text-slate-500'
                    }`}>
                      {j.estado === 'PENDIENTE' && <Clock className="w-3.5 h-3.5" />}
                      {j.estado === 'APROBADA_SUPERVISOR' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {j.estado === 'RECHAZADA' && <XCircle className="w-3.5 h-3.5" />}
                      {j.estado.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    {j.estado === 'PENDIENTE' && (
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => handleStatusChange(j.id, 'APROBADA_SUPERVISOR')}
                          className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors" 
                          title="Aprobar"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleStatusChange(j.id, 'RECHAZADA')}
                          className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors" 
                          title="Rechazar"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {j.estado === 'APROBADA_SUPERVISOR' && (
                      <button 
                          onClick={() => handleStatusChange(j.id, 'CERRADA_RRHH')}
                          className="px-3 py-1.5 bg-slate-900 text-white hover:bg-slate-800 rounded-lg text-xs font-bold transition-colors" 
                        >
                          Cerrar RRHH
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
