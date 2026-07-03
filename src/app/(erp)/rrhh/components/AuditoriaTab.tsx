"use client";

import { useState, useEffect } from 'react';
import { Card, Button, Spinner, DataTable, type DataTableColumn } from '@/components/ui';
import {
  EMPLOYEE_ABSENCE_AUDIT_SELECT,
  TIME_LOG_AUDIT_SELECT,
} from '@/shared/constants/dbProjections';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { FileWarning } from 'lucide-react';

export default function AuditoriaTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [absences, setAbsences] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [periodo, setPeriodo] = useState('Mes Actual');
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    fetchData();
  }, [periodo, selectedDate]);

  const fetchData = async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      let logsQuery = supabase
        .from('time_logs')
        .select(TIME_LOG_AUDIT_SELECT)
        .order('timestamp', { ascending: false })
        .limit(100);

      let absQuery = supabase
        .from('employee_absences')
        .select(EMPLOYEE_ABSENCE_AUDIT_SELECT)
        .order('fecha', { ascending: false });

      if (selectedDate) {
        const start = new Date(selectedDate + 'T00:00:00');
        const end = new Date(selectedDate + 'T23:59:59.999');
        logsQuery = logsQuery.gte('timestamp', start.toISOString()).lte('timestamp', end.toISOString());
        absQuery = absQuery.eq('fecha', selectedDate);
      }

      const { data: logsData } = await logsQuery;
      if (logsData) setLogs(logsData);

      const { data: absData } = await absQuery;
      if (absData) setAbsences(absData);
    }
    setLoading(false);
  };

  const updateAbsenceType = async (id: string, newType: string) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      await supabase.from('employee_absences').update({ tipo_falta: newType }).eq('id', id);
      fetchData();
    }
  };

  const updateJustificacion = async (id: string, oldResolucion: string, newResolucion: string) => {
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      
      // Actualiza la justificación
      await supabase.from('time_justifications')
        .update({ resolucion: newResolucion, aprobado_por: session?.user?.id, fecha_aprobacion: new Date().toISOString() })
        .eq('id', id);

      // Registra en la auditoría
      await supabase.from('time_justifications_audit').insert({
        justification_id: id,
        usuario_id: session?.user?.id,
        campo_modificado: 'resolucion',
        valor_anterior: oldResolucion,
        valor_nuevo: newResolucion,
        motivo_cambio: 'Actualizado desde Panel de Auditoría RRHH'
      });
      
      fetchData();
    }
  };

  // Columnas de marcajes (C3: DataTable). Se definen dentro del componente
  // porque la celda de métricas usa el handler updateJustificacion del scope.
  // La columna de métricas tiene altura variable (justificaciones con selects
  // interactivos), por eso se mantiene fuera de la virtualización
  // (virtualizeThreshold alto) para que las filas crezcan según su contenido.
  const logColumns: DataTableColumn<any>[] = [
    {
      id: 'fecha',
      header: 'Fecha y Hora',
      width: 'minmax(150px,1fr)',
      cellClassName: 'font-medium text-slate-600',
      cell: (log) => new Date(log.timestamp).toLocaleString(),
    },
    {
      id: 'empleado',
      header: 'Empleado',
      width: 'minmax(140px,1fr)',
      cellClassName: 'font-bold text-slate-900',
      cell: (log) => log.employees?.nombre_completo,
    },
    {
      id: 'evento',
      header: 'Evento',
      width: 'minmax(120px,1fr)',
      cell: (log) => (
        <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold bg-[#2ec4f1]/10 text-[#2ec4f1]">
          {log.evento_detectado.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      id: 'metricas',
      header: 'Métricas',
      width: 'minmax(200px,1.4fr)',
      align: 'right',
      cell: (log) => (
        <div className="w-full text-right">
          {log.minutos_retraso_entrada > 0 && <div className="text-xs text-rose-500 font-bold">Retraso {log.minutos_retraso_entrada}m</div>}
          {log.minutos_exceso_almuerzo > 0 && <div className="text-xs text-rose-500 font-bold">Exceso Alm {log.minutos_exceso_almuerzo}m</div>}
          {log.minutos_salida_anticipada > 0 && <div className="text-xs text-amber-500 font-bold">Salida Ant {log.minutos_salida_anticipada}m</div>}
          {log.es_dia_extra && <div className="text-[10px] font-black tracking-widest text-emerald-500 uppercase">Día Extra</div>}

          {log.time_justifications && log.time_justifications.length > 0 && (
            <div className="mt-2 text-left border-l-2 border-slate-200 pl-2">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mb-1">Justificación</div>
              {log.time_justifications.map((just: any) => (
                <div key={just.id} className="mb-2">
                  <div className="text-xs font-medium text-slate-700 italic mb-1">"{just.descripcion}"</div>
                  <select
                    value={just.resolucion || 'Pendiente'}
                    onChange={(e) => updateJustificacion(just.id, just.resolucion || 'Pendiente', e.target.value)}
                    className={`text-[10px] font-bold rounded p-1 outline-none ${just.resolucion === 'Aprobada' ? 'bg-emerald-100 text-emerald-700' : just.resolucion === 'Rechazada' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}
                  >
                    <option value="Pendiente">Pendiente</option>
                    <option value="Aprobada">Aprobar</option>
                    <option value="Rechazada">Rechazar</option>
                  </select>
                </div>
              ))}
            </div>
          )}

          {(log.minutos_retraso_entrada === 0 && log.minutos_exceso_almuerzo === 0 && log.minutos_salida_anticipada === 0 && !log.es_dia_extra && (!log.time_justifications || log.time_justifications.length === 0)) && (
            <span className="text-xs text-emerald-500 font-bold tracking-widest uppercase">OK</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Auditoría de Asistencia</h2>
          <p className="text-sm text-slate-500">Historial de marcajes biométricos y detección de anomalías.</p>
        </div>
        <div className="flex gap-2">
          <input 
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold outline-none text-slate-700"
          />
          <select 
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold outline-none"
          >
            <option>Primera Quincena</option>
            <option>Segunda Quincena</option>
            <option>Mes Actual</option>
          </select>
          <Button variant="outline" onClick={() => setSelectedDate('')}>Limpiar Fecha</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Incidencias Panel */}
        <Card className="lg:col-span-1 border-rose-200 bg-rose-50/30">
          <div className="flex items-center gap-2 mb-4">
            <FileWarning className="w-5 h-5 text-rose-500" />
            <h3 className="font-bold text-slate-800">Incidencias y Faltas</h3>
          </div>
          <p className="text-xs text-slate-500 mb-4">Días laborales sin marcaje detectados por el sistema.</p>
          
          <div className="space-y-3">
            {absences.length === 0 ? (
              <p className="text-sm text-slate-400 font-medium text-center py-4">No hay faltas detectadas en este periodo.</p>
            ) : (
              absences.map(abs => (
                <div key={abs.id} className="bg-white border border-rose-100 p-3 rounded-xl flex flex-col gap-2 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-bold text-slate-800">{abs.employees?.nombre_completo}</div>
                      <div className="text-[10px] text-slate-500 font-medium">{abs.fecha}</div>
                    </div>
                    <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-black tracking-widest">
                      {abs.tipo_falta.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <select 
                    value={abs.tipo_falta}
                    onChange={(e) => updateAbsenceType(abs.id, e.target.value)}
                    className="w-full text-xs font-bold bg-slate-50 border border-slate-200 rounded p-1.5 outline-none"
                  >
                    <option value="FALTA_INJUSTIFICADA">Manejar como Falta Injustificada</option>
                    <option value="VACACIONES">Justificar: Vacaciones</option>
                    <option value="SUSPENSION_IGSS">Justificar: Suspensión IGSS</option>
                    <option value="PERMISO_CON_GOCE">Justificar: Permiso con Goce</option>
                    <option value="PERMISO_SIN_GOCE">Justificar: Permiso sin Goce</option>
                  </select>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Marcajes Table */}
        <Card padding="none" className="lg:col-span-2 overflow-hidden border-slate-200">
          {loading ? (
            <div className="text-center py-10 text-slate-400">
              <Spinner size="md" className="mx-auto mb-2" />
            </div>
          ) : (
            <DataTable
              columns={logColumns}
              data={logs}
              getRowId={(log) => log.id}
              rowHeight={56}
              maxBodyHeight={600}
              minWidth={620}
              virtualizeThreshold={200}
              headerClassName="bg-slate-50 border-b border-slate-100"
              headerTextClassName="text-slate-500"
              emptyMessage="No hay marcajes recientes."
            />
          )}
        </Card>

      </div>
    </div>
  );
}
