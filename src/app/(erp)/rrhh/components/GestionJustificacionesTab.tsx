"use client";

import { useState, useEffect } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card, Button } from '@/components/ui';
import { erpInputClass, erpSoftStat, erpTableHeader, erpTableHeaderText } from '@/lib/design/tokens';
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
        employees (nombre_completo, codigo_empleado),
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

  const tipoBadgeClass = (tipo: string) => {
    if (tipo === 'LLEGADA_TARDE') return erpSoftStat.warning;
    if (tipo === 'HORA_EXTRA') return erpSoftStat.accent;
    if (tipo === 'EXCESO_ALMUERZO') return `${erpSoftStat.accent} bg-[var(--accent)]/10`;
    return erpSoftStat.muted;
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-[var(--muted)] animate-pulse font-bold">
        Cargando justificaciones...
      </div>
    );
  }

  return (
    <Card padding="lg" className="border border-[var(--border)] shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-black text-[var(--heading)] tracking-tight">Gestión de Justificaciones</h2>
          <p className="text-[var(--muted)] font-medium mt-1">Aprobación de tardanzas, horas extras y salidas anticipadas.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input 
              type="text" 
              placeholder="Buscar empleado..." 
              className={`${erpInputClass} pl-10 pr-4 py-2.5 h-auto w-64 border-none bg-[var(--surface-hover)]`}
            />
          </div>
          <Button variant="secondary" size="sm" className="p-2.5 h-auto" aria-label="Filtrar">
            <Filter className="w-5 h-5" />
          </Button>
        </div>
      </div>

      <div className="overflow-hidden border border-[var(--border)] rounded-2xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className={`${erpTableHeader} ${erpTableHeaderText} text-xs font-black uppercase tracking-widest`}>
              <th className="p-4">Fecha / Hora</th>
              <th className="p-4">Empleado</th>
              <th className="p-4">Tipo de Excepción</th>
              <th className="p-4">Motivo (Empleado)</th>
              <th className="p-4">Minutos</th>
              <th className="p-4">Estado</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] text-sm font-medium bg-[var(--surface)]">
            {justifications.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-[var(--muted)]">No hay justificaciones pendientes.</td>
              </tr>
            ) : (
              justifications.map((j) => (
                <tr key={j.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="p-4">
                    <div className="text-[var(--foreground)] font-bold">{new Date(j.created_at).toLocaleDateString()}</div>
                    <div className="text-xs text-[var(--muted)]">{new Date(j.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-[var(--foreground)] font-bold">{j.employees?.nombre_completo}</div>
                    <div className="text-xs text-[var(--muted)]">ID: {j.employees?.codigo_empleado}</div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest ${tipoBadgeClass(j.tipo)}`}>
                      {j.tipo.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="p-4 text-[var(--muted)] max-w-xs truncate" title={j.motivo_empleado}>
                    {j.motivo_empleado || '-'}
                  </td>
                  <td className="p-4 font-bold text-[var(--foreground)]">
                    {j.minutos_calculados} min
                  </td>
                  <td className="p-4">
                    <span className={`flex items-center gap-1.5 text-xs font-bold ${
                      j.estado === 'PENDIENTE' ? 'text-[var(--warning)]' :
                      j.estado === 'APROBADA_SUPERVISOR' ? 'text-[var(--success)]' :
                      j.estado === 'RECHAZADA' ? 'text-[var(--danger)]' :
                      'text-[var(--muted)]'
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
                          className={`p-1.5 rounded-lg transition-colors ${erpSoftStat.success} hover:opacity-80`}
                          title="Aprobar"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleStatusChange(j.id, 'RECHAZADA')}
                          className={`p-1.5 rounded-lg transition-colors ${erpSoftStat.danger} hover:opacity-80`}
                          title="Rechazar"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                    {j.estado === 'APROBADA_SUPERVISOR' && (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => handleStatusChange(j.id, 'CERRADA_RRHH')}
                        className="text-xs uppercase tracking-wider"
                      >
                        Cerrar RRHH
                      </Button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
