"use client";

import { useState } from 'react';
import { Card, Button, Spinner, notify } from '@/components/ui';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { apiFetch } from '@/lib/http/apiFetch';
import { FileSpreadsheet, Calendar, Clock, AlertTriangle, UserX, Briefcase, RefreshCw, BarChart, CalendarDays, Calculator } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ReportesTab() {
  const getLocalDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(getLocalDateString);
  const [endDate, setEndDate] = useState(getLocalDateString);

  const downloadExcel = (data: any[], filename: string) => {
    let exportData = data;
    if (!data || data.length === 0) {
      exportData = [{ 'Mensaje': 'No hay registros para este reporte en las fechas seleccionadas.' }];
    }
    const ws = XLSX.utils.json_to_sheet(exportData);
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
    
    const [sYear, sMonth, sDay] = start.split('-').map(Number);
    const [eYear, eMonth, eDay] = end.split('-').map(Number);

    const startObj = new Date(sYear, sMonth - 1, sDay, 0, 0, 0);
    const endObj = new Date(eYear, eMonth - 1, eDay, 23, 59, 59, 999);

    const { data } = await supabase
      .from('time_logs')
      .select(`
        *, 
        employees(*, company_shifts(*)),
        time_justifications(estado)
      `)
      .gte('timestamp', startObj.toISOString())
      .lte('timestamp', endObj.toISOString())
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

  const formatSecondsHHMMSS = (segundos: number | null | undefined) => {
    if (!segundos || segundos <= 0) return '00:00:00';
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = Math.floor(segundos % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleAsistencia = async (isDiaria: boolean) => {
    setLoading(true);
    const start = isDiaria ? startDate : startDate;
    const end = isDiaria ? startDate : endDate;
    
    const logs = await getLogsData(start, end);
    const exportData: any[] = [];
    
    // Agrupar logs por empleado para procesarlos cronológicamente
    const logsByEmployee = new Map<string, any[]>();
    logs.forEach(l => {
      if (!logsByEmployee.has(l.employee_id)) logsByEmployee.set(l.employee_id, []);
      logsByEmployee.get(l.employee_id)!.push(l);
    });

    logsByEmployee.forEach((empLogs, empId) => {
      // Ordenar logs del empleado cronológicamente
      empLogs.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      
      let currentJornada: any = null;
      let entradaReal: Date | null = null;
      let salidaReal: Date | null = null;
      let totalRetraso = 0;
      let totalSalidaAnticipada = 0;
      let totalHorasExtra = 0;

      const pushCurrentJornada = () => {
        if (currentJornada) {
          // Cálculo Tiempo Laborado
          if (entradaReal && salidaReal) {
            const diffSeconds = Math.floor((salidaReal.getTime() - entradaReal.getTime()) / 1000);
            currentJornada['Tiempo Laborado'] = formatSecondsHHMMSS(diffSeconds > 0 ? diffSeconds : 0);
          }
          currentJornada['Retraso'] = formatSecondsHHMMSS(totalRetraso);
          currentJornada['Salida Anticipada'] = formatSecondsHHMMSS(totalSalidaAnticipada);
          currentJornada['Horas Extra'] = formatSecondsHHMMSS(totalHorasExtra);
          exportData.push(currentJornada);
          
          // Reset para la siguiente jornada
          currentJornada = null;
          entradaReal = null;
          salidaReal = null;
          totalRetraso = 0;
          totalSalidaAnticipada = 0;
          totalHorasExtra = 0;
        }
      };

      empLogs.forEach(l => {
        const timestampDate = new Date(l.timestamp);
        const dayString = timestampDate.toLocaleDateString();
        // Formato 24 Horas
        const timeString = timestampDate.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const event = l.evento_detectado;
        const shift = l.employees?.company_shifts;

        // Iniciar nueva jornada si encontramos un INGRESO o si no hay jornada activa
        if (!currentJornada || event === 'INGRESO') {
          pushCurrentJornada(); // Cierra la anterior si la hubiera
          currentJornada = {
            'Día': dayString,
            'Empleado': l.employees?.nombre_completo,
            'Código': l.employees?.codigo_empleado,
            'Turno': shift?.name || 'Sin Turno',
            'Tipo de Jornada': l.tipo_jornada || (l.es_dia_extra ? 'Descanso' : 'Laboral'),
            'Estado': l.estado_marcacion || 'Normal',
            'Entrada Programada': l.hora_entrada_prog || 'N/A',
            'Entrada Real': event === 'INGRESO' ? timeString : '',
            'Salida Programada': l.hora_salida_prog || 'N/A',
            'Salida Real': '',
            'Inicio Desayuno': '',
            'Fin Desayuno': '',
            'Inicio Almuerzo': '',
            'Fin Almuerzo': '',
            'Tiempo Laborado': '00:00:00',
            'Retraso': '00:00:00',
            'Salida Anticipada': '00:00:00',
            'Horas Extra': '00:00:00',
            'Justificación': '',
            'Resolución': '',
            'Observaciones': ''
          };
          if (event === 'INGRESO') entradaReal = new Date(l.timestamp);
        } else {
          // Asignar tiempo si no es INGRESO
          if (event === 'SALIDA_FINAL') {
            currentJornada['Salida Real'] = timeString;
            salidaReal = new Date(l.timestamp);
          } else if (event === 'SALIDA_REFACCION' || event === 'DESAYUNO_INICIO') {
            currentJornada['Inicio Desayuno'] = timeString;
          } else if (event === 'REGRESO_REFACCION' || event === 'DESAYUNO_FIN') {
            currentJornada['Fin Desayuno'] = timeString;
          } else if (event === 'SALIDA_ALMUERZO' || event === 'ALMUERZO_INICIO') {
            currentJornada['Inicio Almuerzo'] = timeString;
          } else if (event === 'REGRESO_ALMUERZO' || event === 'ALMUERZO_FIN') {
            currentJornada['Fin Almuerzo'] = timeString;
          } else if (event === 'MARCAJE_ESPECIAL') {
            currentJornada['Observaciones'] = `Marcaje Especial a las ${timeString}`;
          }
        }

        // Acumular métricas
        if (l.tardanza_segundos > 0) totalRetraso += l.tardanza_segundos;
        else if (l.minutos_retraso_entrada > 0) totalRetraso += l.minutos_retraso_entrada * 60;
        
        if (l.salida_anticipada_segundos > 0) totalSalidaAnticipada += l.salida_anticipada_segundos;
        else if (l.minutos_salida_anticipada > 0) totalSalidaAnticipada += l.minutos_salida_anticipada * 60;
        
        if (l.horas_extra_segundos > 0) totalHorasExtra += l.horas_extra_segundos;
        else if (l.minutos_extra > 0) totalHorasExtra += l.minutos_extra * 60;

        // Justificaciones
        if (l.justificacion) {
          currentJornada['Justificación'] = currentJornada['Justificación'] ? `${currentJornada['Justificación']} | ${l.justificacion}` : l.justificacion;
        }
        const justificationArr = l.time_justifications as any[];
        if (justificationArr && justificationArr.length > 0) {
          currentJornada['Resolución'] = justificationArr[0].resolucion || 'Pendiente';
        }

        // Si es SALIDA_FINAL, cerramos la jornada inmediatamente
        if (event === 'SALIDA_FINAL') {
          pushCurrentJornada();
        }
      });

      // Asegurar guardar cualquier jornada que quedó abierta al final
      pushCurrentJornada();
    });

    downloadExcel(exportData, isDiaria ? "Asistencia_Diaria" : "Asistencia_Mensual_Periodo");
    setLoading(false);
  };

  const handleTardanzas = async () => {
    setLoading(true);
    const logs = await getLogsData(startDate, endDate);
    
    const tardanzas = logs.filter(l => 
      ((l.tardanza_segundos || 0) > 0) || 
      ((l.tiempo_desayuno_segundos || 0) > 0) || 
      ((l.tiempo_almuerzo_segundos || 0) > 0) || 
      ((l.salida_anticipada_segundos || 0) > 0) ||
      ((l.minutos_retraso_entrada || 0) > 0) || 
      ((l.minutos_exceso_almuerzo || 0) > 0) || 
      ((l.minutos_salida_anticipada || 0) > 0)
    ).map(l => {
      const justificationArr = l.time_justifications as any[];
      const statusJustificacion = justificationArr && justificationArr.length > 0 ? justificationArr[0].estado : 'N/A';
      
      let tipoRetraso = 'Ingreso Tarde';
      let segundos = l.tardanza_segundos || (l.minutos_retraso_entrada ? l.minutos_retraso_entrada * 60 : 0);
      
      if ((l.tiempo_almuerzo_segundos || 0) > 0 || (l.minutos_exceso_almuerzo || 0) > 0) {
        tipoRetraso = 'Exceso de Almuerzo';
        segundos = l.tiempo_almuerzo_segundos || (l.minutos_exceso_almuerzo ? l.minutos_exceso_almuerzo * 60 : 0);
      } else if ((l.tiempo_desayuno_segundos || 0) > 0) {
        tipoRetraso = 'Exceso de Desayuno';
        segundos = l.tiempo_desayuno_segundos;
      } else if ((l.salida_anticipada_segundos || 0) > 0 || (l.minutos_salida_anticipada || 0) > 0) {
        tipoRetraso = 'Salida Anticipada';
        segundos = l.salida_anticipada_segundos || (l.minutos_salida_anticipada ? l.minutos_salida_anticipada * 60 : 0);
      }

      return {
        'Fecha': new Date(l.timestamp).toLocaleDateString(),
        'Empleado': l.employees?.nombre_completo,
        'Hora Marcaje': new Date(l.timestamp).toLocaleTimeString(),
        'Tipo de Retraso': tipoRetraso,
        'Tiempo Perdido': formatSecondsHHMMSS(segundos),
        'Motivo Empleado': l.justificacion || 'Sin justificación',
        'Estado RRHH': statusJustificacion.replace(/_/g, ' ')
      };
    });
    
    downloadExcel(tardanzas, "Tardanzas");
    setLoading(false);
  };

  const handleHorasExtras = async () => {
    setLoading(true);
    const logs = await getLogsData(startDate, endDate);
    
    const extras = logs.filter(l => (l.horas_extra_segundos || 0) > 0 || (l.minutos_extra || 0) > 0 || l.es_dia_extra).map(l => {
      const justificationArr = l.time_justifications as any[];
      const statusJustificacion = justificationArr && justificationArr.length > 0 ? justificationArr[0].estado : 'N/A';

      const segundos = l.horas_extra_segundos || (l.minutos_extra ? l.minutos_extra * 60 : 0);
      let horasCalc = formatSecondsHHMMSS(segundos);
      
      if (l.es_dia_extra) {
        if (segundos >= 21600) { // 6 horas
          horasCalc = 'Pago: Día Completo (' + formatSecondsHHMMSS(segundos) + ')';
        } else {
          horasCalc = 'Pago: Medio Día (' + formatSecondsHHMMSS(segundos) + ')';
        }
      }

      return {
        'Fecha': new Date(l.timestamp).toLocaleDateString(),
        'Empleado': l.employees?.nombre_completo,
        'Hora Salida': new Date(l.timestamp).toLocaleTimeString(),
        'Tiempo Extra Exacto': formatSecondsHHMMSS(segundos),
        'Cálculo de Pago': horasCalc,
        'Día Extraordinario (Feriado/Descanso)': l.es_dia_extra ? 'SÍ' : 'NO',
        'Motivo Reportado': l.justificacion || 'N/A',
        'Estado Aprobación': statusJustificacion.replace(/_/g, ' ')
      };
    });
    
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

        {/* Rendimiento Técnicos (CQRS) */}
        <ReportCard 
          title="Rendimiento Técnicos (CQRS)" 
          desc="Equipos reparados vs fallidos en el mes actual." 
          icon={<Briefcase className="text-emerald-500" />} 
          onClick={async () => {
            setLoading(true);
            try {
              const res = await apiFetch('/api/rrhh/dashboard');
              if (res.ok) {
                const data = await res.json();
                downloadExcel(data.data, "Rendimiento_Tecnicos_Mes");
              } else {
                notify.info('El nuevo módulo RRHH (Feature Flag USE_NEW_RRHH_MODULE) no está activo.');
              }
            } catch(e) {
              console.error(e);
            }
            setLoading(false);
          }} 
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
