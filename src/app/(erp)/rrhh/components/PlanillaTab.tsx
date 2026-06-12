"use client";

import { useState } from 'react';
import { Card, Button, Spinner } from '@/components/ui';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Calculator, Download, CheckCircle2 } from 'lucide-react';

export default function PlanillaTab() {
  const [loading, setLoading] = useState(false);
  const [planilla, setPlanilla] = useState<any[]>([]);
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState('Primera Quincena');

  const generatePlanilla = async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const { data: employees } = await supabase.from('employees').select('id, codigo_empleado, nombre_completo, sueldo_mensual_base, bono_metas');
    
    // Simplificado para MVP: Traemos todo o deberíamos filtrar por periodo
    const { data: logs } = await supabase.from('time_logs').select('*');
    const { data: absences } = await supabase.from('employee_absences').select('*');

    if (employees && logs && absences) {
      const results = employees.map(emp => {
        const empLogs = logs.filter(l => l.employee_id === emp.id);
        const empAbsences = absences.filter(a => a.employee_id === emp.id && a.tipo_falta === 'FALTA_INJUSTIFICADA');

        // Días Únicos Trabajados
        const uniqueDates = new Set(empLogs.map(l => new Date(l.timestamp).toISOString().split('T')[0]));
        const diasTrabajados = uniqueDates.size;

        let totalRetrasoMin = 0;
        let totalExcesoAlmMin = 0;
        let totalSalidaAntMin = 0;
        let totalExtraMin = 0;

        empLogs.forEach(l => {
          totalRetrasoMin += l.minutos_retraso_entrada || 0;
          totalExcesoAlmMin += l.minutos_exceso_almuerzo || 0;
          totalSalidaAntMin += l.minutos_salida_anticipada || 0;
          totalExtraMin += l.minutos_extra || 0;
        });

        // Sueldo Quincenal
        const sueldoMensual = Number(emp.sueldo_mensual_base || 0);
        const sueldoQuincenal = sueldoMensual / 2;
        const sueldoDiario = sueldoQuincenal / 15; // Base estándar 15 días
        const valorMinuto = sueldoDiario / 480;

        const descuentoFaltas = empAbsences.length * sueldoDiario;
        const descuentoTiempos = (totalRetrasoMin + totalExcesoAlmMin + totalSalidaAntMin) * valorMinuto;
        const totalDescuentos = descuentoFaltas + descuentoTiempos;

        // Horas extras (1.5x)
        const pagoExtras = totalExtraMin * (valorMinuto * 1.5);
        const bonoMetas = Number(emp.bono_metas || 0);

        const neto = sueldoQuincenal + pagoExtras + bonoMetas - totalDescuentos;

        return {
          ...emp,
          sueldoQuincenal,
          diasTrabajados,
          faltas: empAbsences.length,
          retrasosMin: totalRetrasoMin + totalExcesoAlmMin,
          salidaAnticipadaMin: totalSalidaAntMin,
          horasExtras: (totalExtraMin / 60).toFixed(1),
          totalExtraMin,
          pagoExtras,
          bonoMetas,
          descuentoTotal: totalDescuentos,
          netoPagar: neto,
          empLogs
        };
      });

      setPlanilla(results);
    }
    setLoading(false);
  };

  const handleExport = () => {
    let csv = "Código,Empleado,Sueldo Quincenal,Dias Trabajados,Faltas Injustificadas,Retrasos (min),Salida Anticipada (min),Horas Extras,Pago Extras,Bono Metas,Descuentos,Neto a Pagar,Detalle Fechas con Tardanzas o Extras\n";

    planilla.forEach(emp => {
      // Filtrar y agrupar incidencias
      const detalles = emp.empLogs
        .filter((l: any) => l.minutos_retraso_entrada > 0 || l.minutos_exceso_almuerzo > 0 || l.minutos_salida_anticipada > 0 || l.minutos_extra > 0 || l.evento_detectado === 'MARCAJE_ESPECIAL')
        .map((l: any) => {
          const d = new Date(l.timestamp).toLocaleDateString();
          let ev = [];
          const motivo = l.justificacion ? `[Motivo: ${l.justificacion}]` : '';

          if(l.evento_detectado === 'MARCAJE_ESPECIAL') {
             ev.push(`Especial ${motivo}`);
          }
          if(l.minutos_retraso_entrada > 0) {
             ev.push(`Tarde: ${l.minutos_retraso_entrada}m ${motivo}`);
          }
          if(l.minutos_exceso_almuerzo > 0) {
             ev.push(`Exceso Receso: ${l.minutos_exceso_almuerzo}m ${motivo}`);
          }
          if(l.minutos_salida_anticipada > 0) {
             ev.push(`Salida Temprano: ${l.minutos_salida_anticipada}m ${motivo}`);
          }
          if(l.minutos_extra > 0) {
             ev.push(`Extra: ${l.minutos_extra}m ${motivo}`);
          }
          return `${d} (${ev.join(' | ')})`;
        }).join(' ; ');

      csv += `"${emp.codigo_empleado}","${emp.nombre_completo}",${emp.sueldoQuincenal.toFixed(2)},${emp.diasTrabajados},${emp.faltas},${emp.retrasosMin},${emp.salidaAnticipadaMin},${emp.horasExtras},${emp.pagoExtras.toFixed(2)},${emp.bonoMetas.toFixed(2)},${emp.descuentoTotal.toFixed(2)},${emp.netoPagar.toFixed(2)},"${detalles}"\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Planilla_${periodoSeleccionado.replace(' ', '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Cálculo de Planilla Quincenal</h2>
          <p className="text-sm text-slate-500">Reporte de nómina avanzado incluyendo horas extras y bonificaciones.</p>
        </div>
        <div className="flex gap-2">
          <select 
            value={periodoSeleccionado}
            onChange={e => setPeriodoSeleccionado(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold outline-none"
          >
            <option>Primera Quincena</option>
            <option>Segunda Quincena</option>
          </select>
          <Button variant="primary" onClick={generatePlanilla} disabled={loading} className="gap-2">
            {loading ? <Spinner size="sm" /> : <Calculator className="w-4 h-4" />}
            {loading ? 'Calculando...' : 'Procesar Planilla'}
          </Button>
        </div>
      </div>

      {planilla.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center border-slate-200 border-dashed">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-[#2ec4f1]">
            <Calculator className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-700 mb-2">Planilla no generada</h3>
          <p className="text-sm text-slate-500 max-w-sm mb-6">Haz clic en el botón superior para procesar horas extras, retrasos y bonificaciones.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-emerald-900">Planilla Generada Exitosamente</h3>
                <p className="text-xs font-medium text-emerald-700">{planilla.length} empleados procesados para {periodoSeleccionado}.</p>
              </div>
            </div>
            <Button variant="outline" onClick={handleExport} className="border-emerald-200 text-emerald-700 hover:bg-emerald-100 font-bold bg-white">
              <Download className="w-4 h-4 mr-2" /> Exportar a Excel (.csv)
            </Button>
          </div>

          <Card padding="none" className="overflow-hidden border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase font-black text-slate-500 tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">Código</th>
                    <th className="px-4 py-3">Empleado</th>
                    <th className="px-4 py-3 text-center">Días Trab.</th>
                    <th className="px-4 py-3 text-center">H. Extras</th>
                    <th className="px-4 py-3 text-right">Sueldo Quincenal</th>
                    <th className="px-4 py-3 text-right text-emerald-500">Pagos Extras/Bonos</th>
                    <th className="px-4 py-3 text-right text-rose-500">Descuentos</th>
                    <th className="px-4 py-3 text-right text-[#2ec4f1]">Neto a Pagar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {planilla.map(emp => (
                    <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-bold text-slate-600">{emp.codigo_empleado}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{emp.nombre_completo}</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-700">{emp.diasTrabajados}</td>
                      <td className="px-4 py-3 text-center font-medium">
                        {Number(emp.horasExtras) > 0 ? (
                          <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded font-bold text-[10px]">{emp.horasExtras}h</span>
                        ) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">Q {emp.sueldoQuincenal.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">
                        + Q {(emp.pagoExtras + emp.bonoMetas).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-rose-500">
                        - Q {emp.descuentoTotal.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-[#2ec4f1] text-base">
                        Q {emp.netoPagar.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
