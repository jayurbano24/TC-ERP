"use client";

import { useState } from 'react';
import { Card, Button, Spinner } from '@/components/ui';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { FileSpreadsheet, Calendar, Clock, AlertTriangle, UserX, Briefcase, RefreshCw, BarChart, CalendarDays, Calculator } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ReportesTab() {
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const downloadExcel = (data: any[], filename: string) => {
    if (!data || data.length === 0) {
      alert("No hay datos para exportar en este rango de fechas.");
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reporte");
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const getEmployeesData = async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return [];
    const { data } = await supabase.from('employees').select('*, hr_departments(name), hr_positions(name), company_shifts(*)');
    return data || [];
  };

  const getLogsData = async (start: string, end: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return [];
    const { data } = await supabase
      .from('biometric_logs')
      .select('*, employees(*, company_shifts(*))')
      .gte('timestamp', `${start}T00:00:00`)
      .lte('timestamp', `${end}T23:59:59`)
      .order('timestamp', { ascending: true });
    return data || [];
  };

  const handlePersonalDepartamento = async () => {
    setLoading(true);
    const emps = await getEmployeesData();
    const exportData = emps.map(e => ({
      'Departamento': e.hr_departments?.name || 'Sin Asignar',
      'Código': e.codigo_empleado,
      'Nombre': e.nombre_completo,
      'Cargo': e.hr_positions?.name || 'Sin Asignar',
      'Tipo Contrato': e.tipo_contrato,
      'Estado': e.estado_rrhh
    })).sort((a, b) => a.Departamento.localeCompare(b.Departamento));
    downloadExcel(exportData, "Personal_Por_Departamento");
    setLoading(false);
  };

  const handleAntiguedad = async () => {
    setLoading(true);
    const emps = await getEmployeesData();
    const exportData = emps.map(e => {
      const start = new Date(e.fecha_inicio_labores);
      const now = new Date();
      const diffTime = Math.abs(now.getTime() - start.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const years = Math.floor(diffDays / 365);
      const months = Math.floor((diffDays % 365) / 30);
      
      return {
        'Código': e.codigo_empleado,
        'Nombre': e.nombre_completo,
        'Fecha Ingreso': e.fecha_inicio_labores,
        'Antigüedad (Años)': years,
        'Antigüedad (Meses)': months,
        'Días Totales': diffDays,
        'Estado': e.estado_rrhh
      };
    }).sort((a, b) => b['Días Totales'] - a['Días Totales']);
    downloadExcel(exportData, "Antiguedad_Historial");
    setLoading(false);
  };

  const handleRotacion = async () => {
    setLoading(true);
    const emps = await getEmployeesData();
    // Altas en el periodo
    const [sy, sm, sd] = startDate.split('-');
    const [ey, em, ed] = endDate.split('-');
    const start = new Date(parseInt(sy), parseInt(sm) - 1, parseInt(sd));
    const end = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed));
    
    const altas = emps.filter(e => {
      if (!e.fecha_inicio_labores) return false;
      const [fy, fm, fd] = e.fecha_inicio_labores.split('-');
      const d = new Date(parseInt(fy), parseInt(fm) - 1, parseInt(fd));
      return d >= start && d <= end;
    }).map(e => ({
      'Tipo Evento': 'ALTA',
      'Fecha': e.fecha_inicio_labores,
      'Código': e.codigo_empleado,
      'Nombre': e.nombre_completo,
      'Departamento': e.hr_departments?.name || '',
      'Estado Actual': e.estado_rrhh
    }));
    
    downloadExcel(altas, "Rotacion_Altas");
    setLoading(false);
  };

  const handleAsistencia = async (isDiaria: boolean) => {
    setLoading(true);
    const start = isDiaria ? startDate : startDate;
    const end = isDiaria ? startDate : endDate; // If diaria, use startDate for both to get 1 day
    
    const logs = await getLogsData(start, end);
    const exportData = logs.map(l => ({
      'Fecha y Hora': new Date(l.timestamp).toLocaleString(),
      'Día': new Date(l.timestamp).toLocaleDateString(),
      'Hora': new Date(l.timestamp).toLocaleTimeString(),
      'Empleado': l.employees?.nombre_completo,
      'Código': l.employees?.codigo_empleado,
      'Evento': l.event_type,
      'Confianza Biometría': l.confidence_score ? `${(l.confidence_score * 100).toFixed(1)}%` : 'N/A'
    }));
    downloadExcel(exportData, isDiaria ? "Asistencia_Diaria" : "Asistencia_Mensual_Periodo");
    setLoading(false);
  };

  const handleTardanzas = async () => {
    setLoading(true);
    const logs = await getLogsData(startDate, endDate);
    
    const tardanzas = logs.filter(l => l.event_type === 'INGRESO' && l.employees?.company_shifts).map(l => {
      const shiftTime = l.employees.company_shifts.start_time; // HH:mm:ss
      const logTime = new Date(l.timestamp).toTimeString().split(' ')[0];
      
      // Calculate delay if logTime > shiftTime + grace period (e.g. 5 mins)
      if (logTime > shiftTime) {
        const logDate = new Date(`1970-01-01T${logTime}Z`);
        const shiftDate = new Date(`1970-01-01T${shiftTime}Z`);
        const delayMin = Math.floor((logDate.getTime() - shiftDate.getTime()) / 60000);
        
        if (delayMin > 5) { // 5 min de gracia
          return {
            'Fecha': new Date(l.timestamp).toLocaleDateString(),
            'Empleado': l.employees?.nombre_completo,
            'Hora Entrada Oficial': shiftTime,
            'Hora Marcaje': logTime,
            'Minutos Retraso': delayMin
          };
        }
      }
      return null;
    }).filter(Boolean);
    
    downloadExcel(tardanzas, "Tardanzas");
    setLoading(false);
  };

  const handleHorasExtras = async () => {
    setLoading(true);
    const logs = await getLogsData(startDate, endDate);
    
    const extras = logs.filter(l => l.event_type === 'SALIDA FINAL' && l.employees?.company_shifts).map(l => {
      const shiftTime = l.employees.company_shifts.end_time; // HH:mm:ss
      const logTime = new Date(l.timestamp).toTimeString().split(' ')[0];
      
      if (logTime > shiftTime) {
        const logDate = new Date(`1970-01-01T${logTime}Z`);
        const shiftDate = new Date(`1970-01-01T${shiftTime}Z`);
        const extraMin = Math.floor((logDate.getTime() - shiftDate.getTime()) / 60000);
        
        if (extraMin > 30) { // Consideramos HE si se queda más de 30 min extra
          return {
            'Fecha': new Date(l.timestamp).toLocaleDateString(),
            'Empleado': l.employees?.nombre_completo,
            'Hora Salida Oficial': shiftTime,
            'Hora Marcaje': logTime,
            'Minutos Extra': extraMin,
            'Horas Extra Calculadas': (extraMin / 60).toFixed(2)
          };
        }
      }
      return null;
    }).filter(Boolean);
    
    downloadExcel(extras, "Horas_Extras");
    setLoading(false);
  };

  const handleAusencias = async () => {
    setLoading(true);
    const emps = await getEmployeesData();
    const logs = await getLogsData(startDate, endDate);
    
    const exportData: any[] = [];
    const [sy, sm, sd] = startDate.split('-');
    const [ey, em, ed] = endDate.split('-');
    const start = new Date(parseInt(sy), parseInt(sm) - 1, parseInt(sd));
    const end = new Date(parseInt(ey), parseInt(em) - 1, parseInt(ed));
    
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      
      const dateStr = d.toLocaleDateString();
      const logsOnDay = logs.filter(l => new Date(l.timestamp).toLocaleDateString() === dateStr);
      
      emps.forEach(e => {
        const isActive = e.estado_rrhh === 'Activo' || e.status === 'Activo' || !e.estado_rrhh;
        const [fy, fm, fd] = (e.fecha_inicio_labores || '2000-01-01').split('-');
        const fechaInicio = new Date(parseInt(fy), parseInt(fm) - 1, parseInt(fd));

        if (isActive && fechaInicio <= d) {
          const hasLog = logsOnDay.some(l => l.employee_id === e.id);
          if (!hasLog) {
            exportData.push({
              'Fecha Ausencia': dateStr,
              'Empleado': e.nombre_completo,
              'Código': e.codigo_empleado || 'N/A',
              'Departamento': e.hr_departments?.name || 'Sin Depto'
            });
          }
        }
      });
    }
    
    downloadExcel(exportData, "Ausencias");
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Centro de Reportes</h2>
        <p className="text-sm text-slate-500">Genera y exporta reportes detallados en formato Excel.</p>
      </div>

      {/* Rango de Fechas Global */}
      <Card className="flex items-center gap-4 bg-slate-50 border-slate-200 shadow-sm">
        <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-slate-400" />
          Periodo de Análisis:
        </div>
        <input 
          type="date" 
          value={startDate} 
          onChange={e => setStartDate(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 outline-none focus:border-[#2ec4f1] text-sm font-medium"
        />
        <span className="text-slate-400 font-medium">al</span>
        <input 
          type="date" 
          value={endDate} 
          onChange={e => setEndDate(e.target.value)}
          className="h-9 px-3 rounded-md border border-slate-200 outline-none focus:border-[#2ec4f1] text-sm font-medium"
        />
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        
        {/* Asistencia */}
        <ReportCard 
          title="Asistencia Diaria" 
          desc="Marcajes de un día específico (usa Fecha Inicial)." 
          icon={<Clock className="text-emerald-500" />} 
          onClick={() => handleAsistencia(true)} 
          loading={loading}
        />
        <ReportCard 
          title="Asistencia Periodo" 
          desc="Marcajes detallados en el rango de fechas." 
          icon={<Calendar className="text-emerald-500" />} 
          onClick={() => handleAsistencia(false)} 
          loading={loading}
        />
        <ReportCard 
          title="Tardanzas" 
          desc="Empleados que ingresaron después de su hora." 
          icon={<AlertTriangle className="text-amber-500" />} 
          onClick={handleTardanzas} 
          loading={loading}
        />
        <ReportCard 
          title="Ausencias" 
          desc="Días laborales sin marcaje de empleados activos." 
          icon={<UserX className="text-rose-500" />} 
          onClick={handleAusencias} 
          loading={loading}
        />
        <ReportCard 
          title="Horas Extras" 
          desc="Salidas registradas después del horario oficial." 
          icon={<Clock className="text-blue-500" />} 
          onClick={handleHorasExtras} 
          loading={loading}
        />

        {/* Organización */}
        <ReportCard 
          title="Personal por Departamento" 
          desc="Directorio agrupado por áreas." 
          icon={<Briefcase className="text-indigo-500" />} 
          onClick={handlePersonalDepartamento} 
          loading={loading}
        />
        <ReportCard 
          title="Historial y Antigüedad" 
          desc="Tiempo de servicio calculado al día de hoy." 
          icon={<BarChart className="text-indigo-500" />} 
          onClick={handleAntiguedad} 
          loading={loading}
        />
        <ReportCard 
          title="Rotación (Altas)" 
          desc="Nuevos ingresos en el periodo seleccionado." 
          icon={<RefreshCw className="text-indigo-500" />} 
          onClick={handleRotacion} 
          loading={loading}
        />

        {/* Próximamente */}
        <ReportCard 
          title="Vacaciones y Permisos" 
          desc="Módulo en desarrollo (Fase 3)." 
          icon={<CalendarDays className="text-slate-300" />} 
          onClick={() => {}} 
          loading={false}
          disabled={true}
        />
        <ReportCard 
          title="Nómina y Salarios" 
          desc="Cálculo salarial en desarrollo (Fase 2)." 
          icon={<Calculator className="text-slate-300" />} 
          onClick={() => {}} 
          loading={false}
          disabled={true}
        />

      </div>
    </div>
  );
}

function ReportCard({ title, desc, icon, onClick, loading, disabled = false }: any) {
  return (
    <Card padding="sm" className={`flex flex-col border-slate-200 hover:border-[#2ec4f1] transition-colors ${disabled ? 'opacity-60 grayscale cursor-not-allowed' : ''}`}>
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-slate-50 rounded-lg">
          {icon}
        </div>
        <h3 className="font-bold text-slate-800 leading-tight">{title}</h3>
      </div>
      <p className="text-xs text-slate-500 flex-1 mb-4">{desc}</p>
      
      <Button 
        variant="outline" 
        className="w-full gap-2 text-xs h-8 border-slate-200 text-slate-700 hover:bg-[#2ec4f1] hover:text-white hover:border-[#2ec4f1]" 
        onClick={onClick}
        disabled={loading || disabled}
      >
        <FileSpreadsheet className="w-3 h-3" /> 
        {disabled ? 'Próximamente' : 'Generar Excel'}
      </Button>
    </Card>
  );
}
