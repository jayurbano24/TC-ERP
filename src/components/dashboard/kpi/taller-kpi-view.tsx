import React from 'react';
import { Card, Badge } from '@/components/ui';
import { Wrench, AlertTriangle, Search, CheckCircle, ArrowRightCircle, Activity } from 'lucide-react';

export function TallerKpiView({ data, timeRange = 'Hoy' }: { data: any, timeRange?: string }) {
  if (!data) return null;
  const timeLabel = timeRange.toUpperCase();

  return (
    <div className="flex flex-col gap-4 border-2 border-slate-200 rounded-xl bg-[#f9f8f4] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
            <Wrench size={20} />
          </div>
          <h3 className="text-lg font-black text-[#181c3a]">Taller — resumen ({timeRange})</h3>
        </div>
        <div className="flex items-center gap-3">
          <a href="/configuracion/metas" className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors">
            <Activity size={14} /> Configurar Metas
          </a>
          <Badge className="bg-[#181c3a] text-white font-bold px-4 py-1.5">{timeRange}</Badge>
        </div>
      </div>

      {/* Cómo leer esta pantalla */}
      <div className="mx-4 mt-2 grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-blue-900">
          <p className="font-black uppercase tracking-wide text-[10px] mb-0.5">Trabajado ({timeRange})</p>
          <p className="font-semibold text-blue-800/90">
            Cards y tablas = OS que <span className="font-black">completaron</span> cada etapa en el periodo
            (1 OS = 1 equipo).
          </p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-emerald-900">
          <p className="font-black uppercase tracking-wide text-[10px] mb-0.5">Aprobados CC ({timeRange})</p>
          <p className="font-semibold text-emerald-800/90">
            Card verde = equipos que CC <span className="font-black">aprobó hoy</span>. Roja = rechazados hoy.
          </p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-[#f3efe6] px-3 py-2 text-[#665a3d]">
          <p className="font-black uppercase tracking-wide text-[10px] mb-0.5">Cola actual (resta)</p>
          <p className="font-semibold">
            Banner = OS que <span className="font-black">aún esperan</span> en taller (WIP vivo, no es del día).
          </p>
        </div>
      </div>

      {/* Warning Banner — WIP / lo que resta */}
      <div className="mx-4 mt-2 px-4 py-3 bg-[#f3efe6] border border-[#e8dfc8] rounded-lg flex items-center gap-3">
        <AlertTriangle className="text-[#a48e58] w-5 h-5 shrink-0" />
        <span className="text-sm font-semibold text-[#665a3d]">
          Cola actual (pendientes, no son del día): Diagnóstico{' '}
          <span className="font-black text-[#181c3a]">{data.pendientesDiagnostico}</span> | CC{' '}
          <span className="font-black text-[#181c3a]">{data.pendientesCC}</span> | L3{' '}
          <span className="font-black text-[#181c3a]">{data.pendientesL3}</span> | Scraps{' '}
          <span className="font-black text-[#181c3a]">{data.pendientesScraps}</span>
        </span>
      </div>

      {/* Main Metrics — completados en el periodo */}
      <div className="grid grid-cols-5 gap-4 px-4">
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1" title="OS que finalizaron diagnóstico en el rango">Diag. hechas ({timeLabel})</p>
          <p className="text-3xl font-black text-blue-600">{data.diagnosticadas}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-blue-600">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1" title="Equipos reacondicionados en el rango">Reacond. hechos ({timeLabel})</p>
          <p className="text-3xl font-black text-blue-600">{data.reacondicionadas}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-blue-600">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1" title="Equipos reparados en el rango">Rep. hechas ({timeLabel})</p>
          <p className="text-3xl font-black text-blue-600">{data.reparadas}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-emerald-600">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1" title="Equipos aprobados por CC en el rango">CC aprobó ({timeLabel})</p>
          <p className="text-3xl font-black text-emerald-600">{data.aprobadasCC}</p>
        </Card>
        <Card className="p-4 bg-white shadow-sm rounded-lg border border-slate-100 border-l-[3px] border-l-rose-600">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1" title="Equipos rechazados por CC en el rango">CC rechazó ({timeLabel})</p>
          <p className="text-3xl font-black text-rose-600">{data.rechazadasCC}</p>
        </Card>
      </div>

      {/* Tables Area */}
      <div className="bg-white mx-4 mb-4 rounded-xl border border-slate-200 overflow-hidden grid grid-cols-2">
        
        {/* Diagnóstico */}
        <div className="border-r border-b border-slate-100 flex flex-col">
          <div className="flex justify-between items-center p-3 bg-blue-50/50 border-b border-slate-100">
            <span className="text-xs font-bold text-blue-700 flex items-center gap-2">
               <Search className="w-4 h-4" /> Diagnóstico
            </span>
            <span className="text-[10px] font-bold text-blue-600">Total: {data.tables.diagnostico.reduce((a:any, b:any) => a + b.procesadas, 0)}</span>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-100">
              <tr><th className="p-2 font-semibold">Técnico</th><th className="p-2 font-semibold text-center">Procesadas ({timeLabel})</th><th className="p-2 font-semibold text-center">Meta periodo</th><th className="p-2 font-semibold text-center text-blue-600">Meta sem.</th><th className="p-2 font-semibold text-center">Pendientes</th><th className="p-2 font-semibold text-center">Estado</th></tr>
            </thead>
            <tbody>
              {data.tables.diagnostico.map((r:any, i:number) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 font-bold text-[#181c3a]">{r.tecnico}</td>
                  <td className="p-2 text-center font-bold text-[#181c3a]">{r.procesadas}</td>
                  <td className="p-2 text-center font-bold text-slate-500">{r.meta}</td>
                  <td className="p-2 text-center font-black text-blue-600">{r.semana}</td>
                  <td className="p-2 text-center text-slate-600 font-semibold">{r.pendientes}</td>
                  <td className="p-2 text-center">
                    <Badge className={`px-2 py-0.5 text-[9px] ${r.estado==='Bono'?'bg-purple-100 text-purple-700':r.estado==='Ok'?'bg-emerald-50 text-emerald-600':'bg-amber-50 text-amber-600'}`}>{r.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Reacondicionado */}
        <div className="border-b border-slate-100 flex flex-col">
          <div className="flex justify-between items-center p-3 bg-emerald-50/50 border-b border-slate-100">
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-2">
               <CheckCircle className="w-4 h-4" /> Reacondicionado
            </span>
            <span className="text-[10px] font-bold text-emerald-600">Total: {data.tables.reacondicionado.reduce((a:any, b:any) => a + b.completadas, 0)}</span>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-100">
              <tr><th className="p-2 font-semibold">Técnico</th><th className="p-2 font-semibold text-center">Completadas ({timeLabel})</th><th className="p-2 font-semibold text-center">Meta periodo</th><th className="p-2 font-semibold text-center text-emerald-600">Meta sem.</th><th className="p-2 font-semibold text-center">TAT prom.</th><th className="p-2 font-semibold text-center">Estado</th></tr>
            </thead>
            <tbody>
              {data.tables.reacondicionado.map((r:any, i:number) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 font-bold text-[#181c3a]">{r.tecnico}</td>
                  <td className="p-2 text-center font-bold text-[#181c3a]">{r.completadas}</td>
                  <td className="p-2 text-center font-bold text-slate-500">{r.meta}</td>
                  <td className="p-2 text-center font-black text-emerald-600">{r.semana}</td>
                  <td className="p-2 text-center text-slate-600 font-semibold">{r.tat}</td>
                  <td className="p-2 text-center">
                    <Badge className={`px-2 py-0.5 text-[9px] ${r.estado==='Bono'?'bg-purple-100 text-purple-700':r.estado==='Ok'?'bg-emerald-50 text-emerald-600':'bg-amber-50 text-amber-600'}`}>{r.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Reparación */}
        <div className="border-r border-slate-100 flex flex-col">
          <div className="flex justify-between items-center p-3 bg-amber-50/50 border-b border-slate-100">
            <span className="text-xs font-bold text-amber-700 flex items-center gap-2">
               <Wrench className="w-4 h-4" /> Reparación
            </span>
            <span className="text-[10px] font-bold text-amber-600">Total: {data.tables.reparacion.reduce((a:any, b:any) => a + b.reparadas, 0)}</span>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-100">
              <tr><th className="p-2 font-semibold">Técnico</th><th className="p-2 font-semibold text-center">Reparadas ({timeLabel})</th><th className="p-2 font-semibold text-center">Meta periodo</th><th className="p-2 font-semibold text-center text-amber-600">Meta sem.</th><th className="p-2 font-semibold text-center">Enviadas CC</th><th className="p-2 font-semibold text-center">Estado</th></tr>
            </thead>
            <tbody>
              {data.tables.reparacion.map((r:any, i:number) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 font-bold text-[#181c3a]">{r.tecnico}</td>
                  <td className="p-2 text-center font-bold text-[#181c3a]">{r.reparadas}</td>
                  <td className="p-2 text-center font-bold text-slate-500">{r.meta}</td>
                  <td className="p-2 text-center font-black text-amber-600">{r.semana}</td>
                  <td className="p-2 text-center text-slate-600 font-semibold">{r.enviadas}</td>
                  <td className="p-2 text-center">
                    <Badge className={`px-2 py-0.5 text-[9px] ${r.estado==='Bono'?'bg-purple-100 text-purple-700':r.estado==='Ok'?'bg-emerald-50 text-emerald-600':'bg-amber-50 text-amber-600'}`}>{r.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Control de calidad */}
        <div className="flex flex-col">
          <div className="flex justify-between items-center p-3 bg-rose-50/50 border-b border-slate-100">
            <span className="text-xs font-bold text-rose-700 flex items-center gap-2">
               <CheckCircle className="w-4 h-4" /> Control de calidad
            </span>
            <span className="text-[10px] font-bold text-rose-600">Total: {data.tables.cc.reduce((a:any, b:any) => a + b.aprobadas + b.rechazadas, 0)}</span>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="text-slate-400 border-b border-slate-100">
              <tr><th className="p-2 font-semibold">Inspector</th><th className="p-2 font-semibold text-center">Aprobadas ({timeLabel})</th><th className="p-2 font-semibold text-center">Meta periodo</th><th className="p-2 font-semibold text-center text-rose-600">Meta sem.</th><th className="p-2 font-semibold text-center">Rechazadas</th><th className="p-2 font-semibold text-center">Técnico rechazado</th><th className="p-2 font-semibold text-center">Estado</th></tr>
            </thead>
            <tbody>
              {data.tables.cc.map((r:any, i:number) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="p-2 font-bold text-[#181c3a]">{r.inspector}</td>
                  <td className="p-2 text-center font-bold text-emerald-600">{r.aprobadas}</td>
                  <td className="p-2 text-center font-bold text-slate-500">{r.meta}</td>
                  <td className="p-2 text-center font-black text-rose-600">{r.semana}</td>
                  <td className="p-2 text-center text-rose-600 font-bold">{r.rechazadas}</td>
                  <td className="p-2 text-center text-slate-500">{r.tecnicoRechazado || '—'}</td>
                  <td className="p-2 text-center">
                    <Badge className={`px-2 py-0.5 text-[9px] ${r.estado==='Bono'?'bg-purple-100 text-purple-700':r.estado==='Ok'?'bg-emerald-50 text-emerald-600':'bg-amber-50 text-amber-600'}`}>{r.estado}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

      </div>

      {/* Tecnología Procesada en Taller */}
      <div className="bg-white mx-4 mb-4 rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex justify-between items-center p-3 bg-slate-50 border-b border-slate-200">
          <span className="text-xs font-black uppercase tracking-widest text-[#181c3a] flex items-center gap-2">
            Tecnología procesada en taller
          </span>
          <span className="text-[10px] font-bold text-slate-500">Métricas por área</span>
        </div>
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100 text-slate-500 border-b border-slate-200">
            <tr>
              <th className="p-3 font-bold uppercase tracking-wider">Tecnología</th>
              <th className="p-3 font-bold uppercase tracking-wider text-center">Diagnóstico</th>
              <th className="p-3 font-bold uppercase tracking-wider text-center">Reacondicionado</th>
              <th className="p-3 font-bold uppercase tracking-wider text-center">Reparación</th>
              <th className="p-3 font-bold uppercase tracking-wider text-center">Control de Calidad</th>
            </tr>
          </thead>
          <tbody>
            {data.tables.tecnologia.map((r:any, i:number) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors last:border-0">
                <td className="p-3 font-black text-[#181c3a]">{r.tecnologia}</td>
                <td className="p-3 text-center font-bold text-blue-600">{r.diagnostico}</td>
                <td className="p-3 text-center font-bold text-emerald-600">{r.reacondicionado}</td>
                <td className="p-3 text-center font-bold text-amber-600">{r.reparacion}</td>
                <td className="p-3 text-center font-bold text-[#86754d]">{r.cc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
