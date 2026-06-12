"use client";

import { useState, useEffect } from 'react';
import { Card, Button, Spinner } from '@/components/ui';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { Calculator, Download, CheckCircle2, History, AlertCircle, FileText, PiggyBank, Briefcase } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ObligacionesTab() {
  const [activeSubTab, setActiveSubTab] = useState<'generar' | 'historial' | 'simulador'>('generar');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold">Obligaciones Patronales e Impuestos</h2>
          <p className="text-sm text-slate-500">Cálculo 100% automático de IGSS, IRTRA, INTECAP e ISR con cierres mensuales.</p>
        </div>
      </div>

      {/* Navegación Interna */}
      <div className="flex gap-4 border-b border-slate-200 pb-2">
        <button 
          onClick={() => setActiveSubTab('generar')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeSubTab === 'generar' ? 'border-[#2ec4f1] text-[#2ec4f1]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Generar Cierre del Mes
        </button>
        <button 
          onClick={() => setActiveSubTab('historial')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeSubTab === 'historial' ? 'border-[#2ec4f1] text-[#2ec4f1]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Historial de Períodos
        </button>
        <button 
          onClick={() => setActiveSubTab('simulador')}
          className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${activeSubTab === 'simulador' ? 'border-[#2ec4f1] text-[#2ec4f1]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Simulador de ISR
        </button>
      </div>

      <div className="pt-4">
        {activeSubTab === 'generar' && <GenerarCierre />}
        {activeSubTab === 'historial' && <HistorialPeriodos />}
        {activeSubTab === 'simulador' && <SimuladorISR />}
      </div>
    </div>
  );
}

// ==========================================
// 1. GENERAR CIERRE MENSUAL
// ==========================================
function GenerarCierre() {
  const [loading, setLoading] = useState(false);
  const [periodo, setPeriodo] = useState(() => {
    const d = new Date();
    return `${d.getMonth() + 1}/${d.getFullYear()}`; // ej 6/2026
  });
  const [empleadosData, setEmpleadosData] = useState<any[]>([]);
  const [resumen, setResumen] = useState<any>(null);

  const calculateTaxesAndObligations = (emp: any) => {
    // Ingresos
    const sueldoBase = Number(emp.sueldo_mensual_base || 0);
    const bonoIncentivo = 250; // Ley
    const horasExtras = 0; // En un escenario real, esto vendría del log de asistencia sumado
    const comisiones = 0; 
    const bonificacionesGravadas = Number(emp.bono_metas || 0);

    // Proyección Anual para ISR
    const sueldoAnual = sueldoBase * 12;
    const bonificacionesGravadasAnual = bonificacionesGravadas * 12;
    const ingresosGravadosAnuales = sueldoAnual + bonificacionesGravadasAnual + (horasExtras * 12) + (comisiones * 12);
    
    // El Aguinaldo y Bono 14 están exentos hasta el 100% del sueldo ordinario.
    // Si sobrepasan, tributan. Asumiremos que son exactos al sueldo ordinario, por tanto 100% exentos.

    // Base IGSS (Todo ingreso excepto Bono Incentivo de Ley y viáticos)
    const salarioAfectoIGSSMensual = sueldoBase + horasExtras + comisiones + bonificacionesGravadas;
    
    // Deducciones de Ley (Mensuales)
    const igssLaboralMensual = salarioAfectoIGSSMensual * 0.0483; // 4.83%
    
    // Deducciones ISR (Anual)
    const deduccionUnica = 48000;
    const igssAnual = igssLaboralMensual * 12;
    const totalDeduccionesISR = deduccionUnica + igssAnual;
    
    // Cálculo ISR
    let baseImponible = ingresosGravadosAnuales - totalDeduccionesISR;
    let isrAnual = 0;
    if (baseImponible > 0) {
      if (baseImponible <= 300000) {
        isrAnual = baseImponible * 0.05;
      } else {
        isrAnual = (300000 * 0.05) + ((baseImponible - 300000) * 0.07);
      }
    }
    const isrMensual = isrAnual / 12;

    // Obligaciones Patronales (Mensuales)
    const igssPatronalMensual = salarioAfectoIGSSMensual * 0.1067; // 10.67%
    const irtraMensual = salarioAfectoIGSSMensual * 0.01; // 1%
    const intecapMensual = salarioAfectoIGSSMensual * 0.01; // 1%

    // Provisión de Prestaciones (1/12 cada mes)
    const provAguinaldo = sueldoBase / 12;
    const provBono14 = sueldoBase / 12;
    const provIndemnizacion = sueldoBase / 12;
    const provVacaciones = (sueldoBase / 30) * 15 / 12;

    const totalIngresos = sueldoBase + bonoIncentivo + horasExtras + comisiones + bonificacionesGravadas;
    const netoPagado = totalIngresos - igssLaboralMensual - isrMensual;
    const costoTotalEmpresa = totalIngresos + igssPatronalMensual + irtraMensual + intecapMensual + provAguinaldo + provBono14 + provIndemnizacion + provVacaciones;

    return {
      codigo: emp.codigo_empleado,
      nombre: emp.nombre_completo,
      departamento: emp.hr_departments?.name || 'N/A',
      sueldoBase,
      bonoIncentivo,
      bonificacionesGravadas,
      salarioAfectoIGSSMensual,
      igssLaboralMensual,
      isrMensual,
      netoPagado,
      igssPatronalMensual,
      irtraMensual,
      intecapMensual,
      costoTotalEmpresa
    };
  };

  const simularCierre = async () => {
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (supabase) {
      const { data } = await supabase.from('employees').select('*, hr_departments(name)').in('estado_rrhh', ['Activo', null]);
      if (data) {
        const calculados = data.map(calculateTaxesAndObligations);
        setEmpleadosData(calculados);

        // Agregación para Dashboard
        const summary = {
          totalEmpleados: calculados.length,
          totalSalarios: calculados.reduce((acc, curr) => acc + curr.sueldoBase + curr.bonoIncentivo + curr.bonificacionesGravadas, 0),
          totalNeto: calculados.reduce((acc, curr) => acc + curr.netoPagado, 0),
          totalIGSSLaboral: calculados.reduce((acc, curr) => acc + curr.igssLaboralMensual, 0),
          totalISRRetenido: calculados.reduce((acc, curr) => acc + curr.isrMensual, 0),
          totalIGSSPatronal: calculados.reduce((acc, curr) => acc + curr.igssPatronalMensual, 0),
          totalIRTRA: calculados.reduce((acc, curr) => acc + curr.irtraMensual, 0),
          totalINTECAP: calculados.reduce((acc, curr) => acc + curr.intecapMensual, 0),
          costoEmpresa: calculados.reduce((acc, curr) => acc + curr.costoTotalEmpresa, 0),
        };
        setResumen(summary);
      }
    }
    setLoading(false);
  };

  const guardarCierre = async () => {
    if (!resumen || empleadosData.length === 0) return;
    setLoading(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    // 1. Insert Cierre
    const { data: userAuth } = await supabase.auth.getUser();
    const userId = userAuth?.user?.id;

    const { data: closure, error: errCierre } = await supabase.from('hr_payroll_closures').insert({
      periodo: periodo,
      estado: 'Procesado',
      usuario_id: userId,
      total_empleados: resumen.totalEmpleados,
      total_salarios: resumen.totalSalarios,
      total_liquido: resumen.totalNeto,
      total_igss_laboral: resumen.totalIGSSLaboral,
      total_igss_patronal: resumen.totalIGSSPatronal,
      total_irtra: resumen.totalIRTRA,
      total_intecap: resumen.totalINTECAP,
      total_isr_retenido: resumen.totalISRRetenido,
      costo_total_patronal: resumen.totalIGSSPatronal + resumen.totalIRTRA + resumen.totalINTECAP,
      costo_total_planilla: resumen.costoEmpresa
    }).select().single();

    if (errCierre || !closure) {
      alert("Error al guardar el cierre. Verifica si corriste el script de BD.");
      setLoading(false);
      return;
    }

    // 2. Log Auditoría
    await supabase.from('hr_audit_logs').insert({
      usuario_id: userId,
      periodo: periodo,
      accion_ejecutada: 'Cierre Mensual de Obligaciones Generado',
      cantidad_empleados: resumen.totalEmpleados
    });

    alert("Cierre Procesado y Guardado en Historial Exitosamente.");
    setLoading(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <label className="text-sm font-bold text-slate-700">Período a Procesar (MM/AAAA):</label>
        <input 
          type="text" 
          value={periodo} 
          onChange={e => setPeriodo(e.target.value)} 
          className="h-10 px-3 border border-slate-200 rounded-xl"
        />
        <Button onClick={simularCierre} disabled={loading}>
          {loading ? 'Calculando...' : 'Simular Cálculos'}
        </Button>
        {resumen && (
          <Button variant="primary" onClick={guardarCierre} disabled={loading}>
            Procesar y Guardar Cierre
          </Button>
        )}
      </div>

      {resumen && (
        <div className="grid grid-cols-3 gap-4">
          <Card padding="md" className="bg-emerald-50 border-emerald-100">
            <h3 className="text-sm font-bold text-emerald-800">Total Líquido a Pagar (Empleados)</h3>
            <p className="text-3xl font-black text-emerald-600 mt-2">Q {resumen.totalNeto.toFixed(2)}</p>
            <div className="mt-4 text-xs text-emerald-700 flex justify-between">
              <span>Retención IGSS: Q{resumen.totalIGSSLaboral.toFixed(2)}</span>
              <span>Retención ISR: Q{resumen.totalISRRetenido.toFixed(2)}</span>
            </div>
          </Card>
          <Card padding="md" className="bg-amber-50 border-amber-100">
            <h3 className="text-sm font-bold text-amber-800">Total Obligaciones Patronales a Pagar</h3>
            <p className="text-3xl font-black text-amber-600 mt-2">Q {(resumen.totalIGSSPatronal + resumen.totalIRTRA + resumen.totalINTECAP).toFixed(2)}</p>
            <div className="mt-4 text-xs text-amber-700 flex justify-between">
              <span>IGSS Pat: Q{resumen.totalIGSSPatronal.toFixed(2)}</span>
              <span>IRT/INT: Q{(resumen.totalIRTRA + resumen.totalINTECAP).toFixed(2)}</span>
            </div>
          </Card>
          <Card padding="md" className="bg-indigo-50 border-indigo-100">
            <h3 className="text-sm font-bold text-indigo-800">Costo Real para la Empresa (con provisiones)</h3>
            <p className="text-3xl font-black text-indigo-600 mt-2">Q {resumen.costoEmpresa.toFixed(2)}</p>
            <div className="mt-4 text-xs text-indigo-700">
              Costo promedio por empleado: Q{(resumen.costoEmpresa / resumen.totalEmpleados).toFixed(2)}
            </div>
          </Card>
        </div>
      )}

      {empleadosData.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 bg-slate-50 uppercase">
                <tr>
                  <th className="px-4 py-3">Empleado</th>
                  <th className="px-4 py-3 text-right">Ingresos Gravados</th>
                  <th className="px-4 py-3 text-right text-rose-600">IGSS Lab (-4.83%)</th>
                  <th className="px-4 py-3 text-right text-rose-600">ISR Mensual</th>
                  <th className="px-4 py-3 text-right text-emerald-600">Líquido a Pagar</th>
                  <th className="px-4 py-3 text-right text-indigo-600">IGSS Patronal (+10.67%)</th>
                  <th className="px-4 py-3 text-right text-indigo-600">Costo Empresa Total</th>
                </tr>
              </thead>
              <tbody>
                {empleadosData.map((e, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">{e.nombre} <span className="block text-xs text-slate-400">{e.codigo}</span></td>
                    <td className="px-4 py-3 text-right">Q {e.salarioAfectoIGSSMensual.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-rose-600">- Q {e.igssLaboralMensual.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-rose-600">- Q {e.isrMensual.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-600">Q {e.netoPagado.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-indigo-600">+ Q {e.igssPatronalMensual.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-600">Q {e.costoTotalEmpresa.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ==========================================
// 2. HISTORIAL DE PERIODOS
// ==========================================
function HistorialPeriodos() {
  const [closures, setClosures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistorial = async () => {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;
      const { data } = await supabase.from('hr_payroll_closures').select('*').order('created_at', { ascending: false });
      setClosures(data || []);
      setLoading(false);
    };
    fetchHistorial();
  }, []);

  const exportCierre = (cierre: any) => {
    // Un JSON a sheet con el resumen
    const ws = XLSX.utils.json_to_sheet([{
      'Periodo': cierre.periodo,
      'Fecha Procesado': new Date(cierre.fecha_proceso).toLocaleDateString(),
      'Estado': cierre.estado,
      'Total Empleados': cierre.total_empleados,
      'Total Salarios Brutos': cierre.total_salarios,
      'Líquido a Pagar Empleados': cierre.total_liquido,
      'IGSS Retenido a Empleados': cierre.total_igss_laboral,
      'ISR Retenido a Empleados': cierre.total_isr_retenido,
      'IGSS Pago Patronal': cierre.total_igss_patronal,
      'IRTRA (1%)': cierre.total_irtra,
      'INTECAP (1%)': cierre.total_intecap,
      'Total Obligaciones Patronales': cierre.costo_total_patronal,
      'Costo Total Empleador Planilla': cierre.costo_total_planilla
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumen");
    XLSX.writeFile(wb, `Cierre_${cierre.periodo.replace('/', '_')}.xlsx`);
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      {closures.length === 0 ? (
        <p className="text-slate-500">No hay cierres mensuales registrados.</p>
      ) : (
        closures.map(c => (
          <Card key={c.id} className="flex justify-between items-center bg-white shadow-sm border-slate-200 p-4">
            <div>
              <h3 className="font-bold text-lg">{c.periodo} <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full">{c.estado}</span></h3>
              <p className="text-sm text-slate-500 mt-1">
                {c.total_empleados} empleados | Procesado el {new Date(c.fecha_proceso).toLocaleDateString()}
              </p>
              <div className="flex gap-4 mt-2 text-xs font-medium">
                <span className="text-slate-600">Líquido: Q{c.total_liquido?.toFixed(2)}</span>
                <span className="text-rose-600">Retenciones (IGSS/ISR): Q{(c.total_igss_laboral + c.total_isr_retenido)?.toFixed(2)}</span>
                <span className="text-indigo-600">Cuota Patronal (IGSS/IRT/INT): Q{c.costo_total_patronal?.toFixed(2)}</span>
              </div>
            </div>
            <Button variant="outline" className="gap-2" onClick={() => exportCierre(c)}>
              <Download className="w-4 h-4" /> Exportar Resumen
            </Button>
          </Card>
        ))
      )}
    </div>
  );
}

// ==========================================
// 3. SIMULADOR ISR
// ==========================================
function SimuladorISR() {
  const [salarioBase, setSalarioBase] = useState(12000);
  const [bonoIncentivo, setBonoIncentivo] = useState(250);
  const [otrosGravados, setOtrosGravados] = useState(0);

  // Cálculos reactivos
  const salarioAfectoIGSSMensual = salarioBase + otrosGravados;
  const igssLaboralMensual = salarioAfectoIGSSMensual * 0.0483; // 4.83%
  const igssAnual = igssLaboralMensual * 12;
  
  const ingresosGravadosAnuales = (salarioBase * 12) + (otrosGravados * 12); // Bono incentivo Q250 NO tributa ISR ni IGSS
  const deduccionUnica = 48000;
  const totalDeducciones = deduccionUnica + igssAnual;
  
  let baseImponible = ingresosGravadosAnuales - totalDeducciones;
  let isrAnual = 0;
  if (baseImponible > 0) {
    if (baseImponible <= 300000) {
      isrAnual = baseImponible * 0.05; // 5%
    } else {
      isrAnual = (300000 * 0.05) + ((baseImponible - 300000) * 0.07); // 7% sobre el excedente
    }
  }
  const isrMensual = isrAnual / 12;

  const ingresosMensualesTotales = salarioBase + bonoIncentivo + otrosGravados;
  const liquidoMensual = ingresosMensualesTotales - igssLaboralMensual - isrMensual;

  return (
    <Card className="max-w-4xl mx-auto border-indigo-100 bg-indigo-50/20">
      <div className="grid grid-cols-2 gap-8 p-4">
        {/* Entradas */}
        <div className="space-y-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-indigo-500" /> Variables de Ingreso
          </h3>
          
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Salario Base Mensual (Q)</label>
            <input type="number" value={salarioBase} onChange={e => setSalarioBase(Number(e.target.value))} className="w-full h-10 px-3 rounded-xl border border-slate-200 outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Bono Incentivo Ley (Q) - Exento</label>
            <input type="number" value={bonoIncentivo} onChange={e => setBonoIncentivo(Number(e.target.value))} className="w-full h-10 px-3 rounded-xl border border-slate-200 outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 block mb-1">Otras Bonificaciones/Comisiones Gravadas (Q)</label>
            <input type="number" value={otrosGravados} onChange={e => setOtrosGravados(Number(e.target.value))} className="w-full h-10 px-3 rounded-xl border border-slate-200 outline-none focus:border-indigo-500" />
          </div>
        </div>

        {/* Resultados */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <h3 className="font-bold text-slate-800 border-b border-slate-100 pb-2">Proyección Anual ISR (Asalariado)</h3>
          
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Ingresos Gravados Anuales:</span>
            <span className="font-bold">Q {ingresosGravadosAnuales.toLocaleString('es-GT', {minimumFractionDigits: 2})}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-500">
            <span>Deducción Única Ley:</span>
            <span>- Q {deduccionUnica.toLocaleString('es-GT', {minimumFractionDigits: 2})}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-500">
            <span>IGSS Laboral Anual Deducible:</span>
            <span>- Q {igssAnual.toLocaleString('es-GT', {minimumFractionDigits: 2})}</span>
          </div>
          <div className="flex justify-between text-sm font-bold border-t border-slate-100 pt-2 text-amber-700">
            <span>Renta Imponible:</span>
            <span>Q {baseImponible > 0 ? baseImponible.toLocaleString('es-GT', {minimumFractionDigits: 2}) : '0.00'}</span>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <div className="flex justify-between text-lg font-black text-rose-600">
              <span>ISR Anual a Pagar:</span>
              <span>Q {isrAnual.toLocaleString('es-GT', {minimumFractionDigits: 2})}</span>
            </div>
            <div className="flex justify-between text-md font-bold text-rose-500 mt-1">
              <span>Retención Mensual ISR:</span>
              <span>Q {isrMensual.toLocaleString('es-GT', {minimumFractionDigits: 2})}</span>
            </div>
          </div>

          <div className="mt-4 bg-slate-50 p-3 rounded-xl">
             <div className="flex justify-between text-sm font-bold text-emerald-600">
              <span>Sueldo Líquido Mensual Estimado:</span>
              <span>Q {liquidoMensual.toLocaleString('es-GT', {minimumFractionDigits: 2})}</span>
            </div>
             <p className="text-[10px] text-slate-400 mt-1 leading-tight">Después de retenciones laborales (IGSS: Q{igssLaboralMensual.toFixed(2)}, ISR: Q{isrMensual.toFixed(2)}). Incluye bono de ley.</p>
          </div>

        </div>
      </div>
    </Card>
  );
}
